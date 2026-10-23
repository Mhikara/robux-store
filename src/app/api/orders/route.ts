import { NextResponse } from "next/server";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const globalForPool = globalThis as unknown as {
  ordersPool?: Pool;
};

const pool =
  globalForPool.ordersPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.ordersPool = pool;
}

export async function POST(request: Request) {
  let body: {
    username?: unknown;
    robuxAmount?: unknown;
    buyerEmail?: unknown;
    buyerWhatsapp?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Format permintaan tidak valid." },
      { status: 400 }
    );
  }

  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const amount = Number(body.robuxAmount);

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json(
      { error: "Username Roblox tidak valid." },
      { status: 400 }
    );
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount < 10 ||
    amount > 10000
  ) {
    return NextResponse.json(
      { error: "Jumlah Robux harus 10–10.000." },
      { status: 400 }
    );
  }

  const buyerEmail =
    typeof body.buyerEmail === "string" ? body.buyerEmail.trim() : null;
  const buyerWhatsapp =
    typeof body.buyerWhatsapp === "string"
      ? body.buyerWhatsapp.trim()
      : null;

  if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    return NextResponse.json(
      { error: "Format email tidak valid." },
      { status: 400 }
    );
  }

  if (buyerWhatsapp && !/^[0-9+()\-\s]{8,20}$/.test(buyerWhatsapp)) {
    return NextResponse.json(
      { error: "Nomor WhatsApp tidak valid." },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const config = await client.query(
      'SELECT "totalStock", "reservedStock", "pricePerRobux" FROM "StoreConfig" WHERE id = 1 FOR UPDATE'
    );

    if (!config.rows.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Konfigurasi stok belum tersedia." },
        { status: 503 }
      );
    }

    const row = config.rows[0];
    const availableStock =
      Number(row.totalStock) - Number(row.reservedStock);
    const pricePerRobux = Number(row.pricePerRobux);

    if (amount > availableStock) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Stok Robux tidak mencukupi.", availableStock },
        { status: 409 }
      );
    }

    // Harga dihitung dari database, tidak dari input pengguna.
    const totalPrice = amount * pricePerRobux;

    if (!Number.isSafeInteger(totalPrice)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Total harga tidak valid." },
        { status: 400 }
      );
    }

    const orderId = randomUUID();

    await client.query(
      `INSERT INTO "Order"
        (id, "robloxUsername", "robuxAmount", "pricePerRobux",
         "totalPrice", "buyerEmail", "buyerWhatsapp", status,
         "createdAt", "updatedAt", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING',
               NOW(), NOW(), NOW() + INTERVAL '30 minutes')`,
      [
        orderId,
        username,
        amount,
        pricePerRobux,
        totalPrice,
        buyerEmail,
        buyerWhatsapp,
      ]
    );

    await client.query(
    `UPDATE "StoreConfig"
     SET "reservedStock" = "reservedStock" + $1,
         "updatedAt" = NOW()
     WHERE id = 1`,
    [amount]
  );

  await client.query("COMMIT");

    return NextResponse.json(
      {
        orderId,
        username,
        robuxAmount: amount,
        pricePerRobux,
        totalPrice,
        currency: "IDR",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Create order error:", error);
    return NextResponse.json(
      { error: "Pesanan gagal dibuat. Periksa struktur database." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
