import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Pool } from "pg";

export const runtime = "nodejs";

const g = globalThis as unknown as { orderStatusPool?: Pool };
const pool =
  g.orderStatusPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });
if (process.env.NODE_ENV !== "production") g.orderStatusPool = pool;

function mapOrder(o: Record<string, unknown>) {
  return {
    id: o.id as string,
    username: o.robloxUsername as string,
    robuxAmount: Number(o.robuxAmount),
    pricePerRobux: Number(o.pricePerRobux),
    totalPrice: Number(o.totalPrice),
    status: o.status as string,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    expiresAt: o.expiresAt,
    paidAt: o.paidAt,
    completedAt: o.completedAt,
  };
}

export async function POST(request: Request) {
  let body: { token?: unknown; query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database belum dikonfigurasi." },
      { status: 503 }
    );
  }

  try {
    await pool.query(
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "statusTokenHash" TEXT`
    );

    // 1) Lookup aman lewat token status
    if (typeof body.token === "string" && body.token.length >= 40) {
      if (body.token.length > 100) {
        return NextResponse.json(
          { error: "Token status tidak valid." },
          { status: 400 }
        );
      }
      const hash = createHash("sha256").update(body.token).digest("hex");
      const result = await pool.query(
        `SELECT id, "robloxUsername", "robuxAmount", "pricePerRobux", "totalPrice",
                status, "createdAt", "updatedAt", "expiresAt", "paidAt", "completedAt"
         FROM "Order"
         WHERE "statusTokenHash" = $1
         LIMIT 1`,
        [hash]
      );
      if (!result.rowCount) {
        return NextResponse.json(
          { error: "Pesanan tidak ditemukan.", orders: [] },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { order: mapOrder(result.rows[0]), orders: [mapOrder(result.rows[0])] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2) Lookup lewat username Roblox ATAU email (mirip UI Cek Pesanan)
    const query =
      typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";

    if (!query || query.length < 3) {
      return NextResponse.json(
        {
          error:
            "Masukkan minimal 3 karakter username Roblox atau email.",
        },
        { status: 400 }
      );
    }

    const isEmail = query.includes("@");
    let result;

    if (isEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query)) {
        return NextResponse.json(
          { error: "Format email tidak valid." },
          { status: 400 }
        );
      }
      result = await pool.query(
        `SELECT id, "robloxUsername", "robuxAmount", "pricePerRobux", "totalPrice",
                status, "createdAt", "updatedAt", "expiresAt", "paidAt", "completedAt"
         FROM "Order"
         WHERE "buyerEmail" IS NOT NULL
           AND LOWER("buyerEmail") = LOWER($1)
         ORDER BY "createdAt" DESC
         LIMIT 20`,
        [query]
      );
    } else {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(query)) {
        return NextResponse.json(
          { error: "Username Roblox tidak valid." },
          { status: 400 }
        );
      }
      result = await pool.query(
        `SELECT id, "robloxUsername", "robuxAmount", "pricePerRobux", "totalPrice",
                status, "createdAt", "updatedAt", "expiresAt", "paidAt", "completedAt"
         FROM "Order"
         WHERE LOWER("robloxUsername") = LOWER($1)
         ORDER BY "createdAt" DESC
         LIMIT 20`,
        [query]
      );
    }

    if (!result.rowCount) {
      return NextResponse.json(
        {
          error: "Tidak ada data invoice",
          message:
            "Username atau email yang dimasukkan belum memiliki riwayat transaksi, harap masukkan email & username dengan tepat",
          orders: [],
        },
        { status: 404 }
      );
    }

    const orders = result.rows.map(mapOrder);
    return NextResponse.json(
      { orders, order: orders[0] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("Order status read failed:", e);
    return NextResponse.json(
      { error: "Gagal memuat status pesanan." },
      { status: 500 }
    );
  }
}
