import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

const globalForPool = globalThis as unknown as {
  configPool?: Pool;
};

const pool =
  globalForPool.configPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.configPool = pool;
}

export async function GET() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const expired = await client.query(
      `SELECT id, "robuxAmount"
       FROM "Order"
       WHERE status = 'PENDING'
         AND "expiresAt" IS NOT NULL
         AND "expiresAt" <= NOW()
       ORDER BY "expiresAt"
       LIMIT 100
       FOR UPDATE SKIP LOCKED`
    );

    let releasedStock = 0;

    for (const order of expired.rows) {
      const updated = await client.query(
        `UPDATE "Order"
         SET status = 'EXPIRED', "updatedAt" = NOW()
         WHERE id = $1 AND status = 'PENDING'
         RETURNING id`,
        [order.id]
      );

      if (updated.rowCount === 1) {
        releasedStock += Number(order.robuxAmount);
      }
    }

    if (releasedStock > 0) {
      await client.query(
        `UPDATE "StoreConfig"
         SET "reservedStock" = GREATEST(
           0, "reservedStock" - $1
         ),
         "updatedAt" = NOW()
         WHERE id = 1`,
        [releasedStock]
      );
    }

    const result = await client.query(
      `SELECT "totalStock", "reservedStock", "pricePerRobux"
       FROM "StoreConfig"
       WHERE id = 1`
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Data stok belum tersedia." },
        { status: 404 }
      );
    }

    const row = result.rows[0];

    await client.query("COMMIT");

    return NextResponse.json({
      stock: Math.max(
        0,
        Number(row.totalStock) - Number(row.reservedStock)
      ),
      pricePerRobux: Number(row.pricePerRobux),
      currency: "IDR",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("API config error:", error);

    return NextResponse.json(
      { error: "Gagal memuat konfigurasi toko." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
