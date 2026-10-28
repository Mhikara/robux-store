import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Pool } from "pg";
export const runtime = "nodejs";
const g = globalThis as unknown as { orderStatusPool?: Pool };
const pool = g.orderStatusPool ?? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
if (process.env.NODE_ENV !== "production") g.orderStatusPool = pool;
export async function POST(request: Request) {
  let body: { token?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  if (typeof body.token !== "string" || body.token.length < 40 || body.token.length > 100) return NextResponse.json({ error: "Token status tidak valid." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database belum dikonfigurasi." }, { status: 503 });
  const hash = createHash("sha256").update(body.token).digest("hex");
  try {
    await pool.query('ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "statusTokenHash" TEXT');
    const result = await pool.query(`SELECT id, "robloxUsername", "robuxAmount", "pricePerRobux", "totalPrice", status, "createdAt", "updatedAt", "expiresAt", "paidAt", "completedAt" FROM "Order" WHERE "statusTokenHash" = $1 LIMIT 1`, [hash]);
    if (!result.rowCount) return NextResponse.json({ error: "Pesanan tidak ditemukan. Periksa tautan status." }, { status: 404 });
    const o = result.rows[0];
    return NextResponse.json({ order: { id: o.id, username: o.robloxUsername, robuxAmount: Number(o.robuxAmount), pricePerRobux: Number(o.pricePerRobux), totalPrice: Number(o.totalPrice), status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt, expiresAt: o.expiresAt, paidAt: o.paidAt, completedAt: o.completedAt } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { console.error("Order status read failed:", e); return NextResponse.json({ error: "Gagal memuat status pesanan." }, { status: 500 }); }
}
