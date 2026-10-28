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
  const allowedStatuses = [
    "PENDING",
    "PAID",
    "PROCESSING",
    "COMPLETED",
    "EXPIRED",
    "FAILED",
  ];

  if (status && !allowedStatuses.includes(status)) {
    return NextResponse.json(
      { error: "Filter status tidak valid." },
      { status: 400 }
    );
  }

  try {
    const result = await pool.query(
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
         ($1 = '' OR "robloxUsername" ILIKE '%' || $1 || '%')
         AND ($2 = '' OR status::text = $2)
       ORDER BY "createdAt" DESC
       LIMIT 100`,
      [query, status]
    );

    return NextResponse.json({
      ok: true,
      orders: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Admin orders query failed:", error);
    return NextResponse.json(
      { error: "Gagal memuat riwayat pesanan." },
      { status: 500 }
    );
  }
}
