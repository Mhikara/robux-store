import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { isAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";

const globalForPool = globalThis as unknown as {
  adminOrdersPool?: Pool;
};

const pool =
  globalForPool.adminOrdersPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.adminOrdersPool = pool;
}

const ALLOWED = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "EXPIRED",
  "FAILED",
] as const;

type OrderStatus = (typeof ALLOWED)[number];

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "Akses admin diperlukan." },
      { status: 401 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database belum dikonfigurasi." },
      { status: 503 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const status = (searchParams.get("status") ?? "").trim();

  if (status && !ALLOWED.includes(status as OrderStatus)) {
    return NextResponse.json(
      { error: "Filter status tidak valid." },
      { status: 400 }
    );
  }

  try {
    const [ordersResult, summaryResult] = await Promise.all([
      pool.query(
        `SELECT
           "id",
           "robloxUsername",
           "robuxAmount",
           "totalPrice",
           "buyerWhatsapp",
           "status",
           "createdAt",
           "paidAt",
           "completedAt",
           "expiresAt"
         FROM "Order"
         WHERE
           ($1 = '' OR "robloxUsername" ILIKE '%' || $1 || '%' OR "id"::text ILIKE '%' || $1 || '%')
           AND ($2 = '' OR status::text = $2)
         ORDER BY "createdAt" DESC
         LIMIT 100`,
        [query, status]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid,
           COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
           COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
           COUNT(*) FILTER (WHERE status IN ('FAILED', 'EXPIRED'))::int AS failed_or_expired,
           COALESCE(SUM("totalPrice") FILTER (WHERE status IN ('PAID', 'PROCESSING', 'COMPLETED')), 0)::bigint AS total_sales,
           COALESCE(SUM("robuxAmount") FILTER (WHERE status IN ('PENDING', 'PAID', 'PROCESSING')), 0)::int AS reserved_robux
         FROM "Order"`
      ),
    ]);

    const s = summaryResult.rows[0];

    return NextResponse.json({
      ok: true,
      orders: ordersResult.rows,
      count: ordersResult.rows.length,
      summary: {
        total: Number(s.total),
        pending: Number(s.pending),
        paid: Number(s.paid),
        processing: Number(s.processing),
        completed: Number(s.completed),
        failedOrExpired: Number(s.failed_or_expired),
        totalSales: Number(s.total_sales),
        reservedRobux: Number(s.reserved_robux),
      },
    });
  } catch (error) {
    console.error("Admin orders query failed:", error);
    return NextResponse.json(
      { error: "Gagal memuat riwayat pesanan." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: "Akses admin diperlukan." },
      { status: 401 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database belum dikonfigurasi." },
      { status: 503 }
    );
  }

  let body: { orderId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  const orderId =
    typeof body.orderId === "string" ? body.orderId.trim() : "";
  const nextStatus =
    typeof body.status === "string" ? body.status.trim() : "";

  if (!orderId || orderId.length > 100) {
    return NextResponse.json(
      { error: "ID pesanan tidak valid." },
      { status: 400 }
    );
  }

  if (
    nextStatus !== "PROCESSING" &&
    nextStatus !== "COMPLETED" &&
    nextStatus !== "FAILED"
  ) {
    return NextResponse.json(
      {
        error:
          "Status yang diizinkan: PROCESSING, COMPLETED, atau FAILED.",
      },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT id, status, "robuxAmount"
       FROM "Order"
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!orderResult.rows.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Pesanan tidak ditemukan." },
        { status: 404 }
      );
    }

    const order = orderResult.rows[0];
    const current = order.status as string;
    const robuxAmount = Number(order.robuxAmount);

    const allowedFrom: Record<string, string[]> = {
      PROCESSING: ["PAID", "PROCESSING"],
      COMPLETED: ["PAID", "PROCESSING"],
      FAILED: ["PENDING", "PAID", "PROCESSING", "EXPIRED"],
    };

    if (!allowedFrom[nextStatus]?.includes(current)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: `Tidak bisa mengubah status dari ${current} ke ${nextStatus}.`,
        },
        { status: 409 }
      );
    }

    if (nextStatus === current) {
      await client.query("COMMIT");
      return NextResponse.json({
        ok: true,
        status: current,
        unchanged: true,
      });
    }

    if (nextStatus === "COMPLETED") {
      const cfg = await client.query(
        `SELECT id FROM "StoreConfig" WHERE id = 1 FOR UPDATE`
      );
      if (!cfg.rows.length) throw new Error("StoreConfig missing");

      await client.query(
        `UPDATE "StoreConfig"
         SET "reservedStock" = GREATEST(0, "reservedStock" - $1),
             "totalStock" = GREATEST(0, "totalStock" - $1),
             "updatedAt" = NOW()
         WHERE id = 1`,
        [robuxAmount]
      );

      await client.query(
        `UPDATE "Order"
         SET status = 'COMPLETED',
             "completedAt" = COALESCE("completedAt", NOW()),
             "updatedAt" = NOW()
         WHERE id = $1`,
        [orderId]
      );
    } else if (nextStatus === "FAILED") {
      if (["PENDING", "PAID", "PROCESSING"].includes(current)) {
        await client.query(
          `UPDATE "StoreConfig"
           SET "reservedStock" = GREATEST(0, "reservedStock" - $1),
               "updatedAt" = NOW()
           WHERE id = 1`,
          [robuxAmount]
        );
      }

      await client.query(
        `UPDATE "Order"
         SET status = 'FAILED', "updatedAt" = NOW()
         WHERE id = $1`,
        [orderId]
      );
    } else {
      await client.query(
        `UPDATE "Order"
         SET status = 'PROCESSING', "updatedAt" = NOW()
         WHERE id = $1`,
        [orderId]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      orderId,
      previousStatus: current,
      status: nextStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin order status update failed:", error);
    return NextResponse.json(
      { error: "Gagal memperbarui status pesanan." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
