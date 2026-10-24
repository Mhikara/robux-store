import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { isAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";

const globalForPool = globalThis as unknown as { adminConfigPool?: Pool };
const pool = globalForPool.adminConfigPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});
if (process.env.NODE_ENV !== "production") globalForPool.adminConfigPool = pool;

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database belum dikonfigurasi." }, { status: 503 });
  try {
    const result = await pool.query(
      `SELECT "totalStock", "reservedStock", "pricePerRobux", "updatedAt"
       FROM "StoreConfig" WHERE id = 1`
    );
    if (!result.rows.length) return NextResponse.json({ error: "Konfigurasi toko tidak ditemukan." }, { status: 404 });
    const row = result.rows[0];
    const totalStock = Number(row.totalStock);
    const reservedStock = Number(row.reservedStock);
    return NextResponse.json({
      totalStock,
      reservedStock,
      availableStock: Math.max(0, totalStock - reservedStock),
      pricePerRobux: Number(row.pricePerRobux),
      minimumPurchase: 10,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    console.error("Admin config read failed:", error);
    return NextResponse.json({ error: "Gagal membaca konfigurasi toko." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database belum dikonfigurasi." }, { status: 503 });

  let body: { totalStock?: unknown; pricePerRobux?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }
  const totalStock = Number(body.totalStock);
  const pricePerRobux = Number(body.pricePerRobux);
  if (!Number.isSafeInteger(totalStock) || totalStock < 0 || totalStock > 100000000) {
    return NextResponse.json({ error: "Total stok harus berupa bilangan bulat 0–100.000.000." }, { status: 400 });
  }
  if (!Number.isSafeInteger(pricePerRobux) || pricePerRobux < 1 || pricePerRobux > 100000000) {
    return NextResponse.json({ error: "Harga harus berupa bilangan bulat positif." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT "reservedStock" FROM "StoreConfig" WHERE id = 1 FOR UPDATE`
    );
    if (!current.rows.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Konfigurasi toko tidak ditemukan." }, { status: 404 });
    }
    const reservedStock = Number(current.rows[0].reservedStock);
    if (totalStock < reservedStock) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        error: `Total stok tidak boleh lebih kecil dari stok yang sedang dipesan (${reservedStock} Robux).`,
        reservedStock,
      }, { status: 409 });
    }
    const updated = await client.query(
      `UPDATE "StoreConfig"
       SET "totalStock" = $1, "pricePerRobux" = $2, "updatedAt" = NOW()
       WHERE id = 1
       RETURNING "totalStock", "reservedStock", "pricePerRobux", "updatedAt"`,
      [totalStock, pricePerRobux]
    );
    await client.query("COMMIT");
    const row = updated.rows[0];
    return NextResponse.json({
      ok: true,
      totalStock: Number(row.totalStock),
      reservedStock: Number(row.reservedStock),
      availableStock: Math.max(0, Number(row.totalStock) - Number(row.reservedStock)),
      pricePerRobux: Number(row.pricePerRobux),
      minimumPurchase: 10,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Admin config update failed:", error);
    return NextResponse.json({ error: "Gagal menyimpan pengaturan toko." }, { status: 500 });
  } finally {
    client.release();
  }
}
