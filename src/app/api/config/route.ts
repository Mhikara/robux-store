import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

export async function GET() {
  try {
    const result = await pool.query(
      'SELECT "totalStock", "reservedStock", "pricePerRobux" FROM "StoreConfig" WHERE id = 1'
    );

    if (!result.rows.length) {
      return NextResponse.json(
        { error: "Data stok belum tersedia" },
        { status: 404 }
      );
    }

    const row = result.rows[0];

    return NextResponse.json({
      stock: Math.max(
        0,
        Number(row.totalStock) - Number(row.reservedStock)
      ),
      pricePerRobux: Number(row.pricePerRobux),
      currency: "IDR",
    });
  } catch (error) {
    console.error("API config error:", error);

    return NextResponse.json(
      { error: "Gagal membaca database Neon" },
      { status: 500 }
    );
  }
}
