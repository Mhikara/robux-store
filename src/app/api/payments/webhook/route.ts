import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

export const runtime = "nodejs";

const globalForPool = globalThis as unknown as {
  webhookPool?: Pool;
};

const pool =
  globalForPool.webhookPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.webhookPool = pool;
}

function verifySignature(
  rawBody: string,
  header: string,
  secret: string,
): boolean {
  let timestamp = "";
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") timestamp = value ?? "";
    if (key === "v1" && value) signatures.push(value);
  }

  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) {
    return false;
  }

  const time = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isSafeInteger(time) || Math.abs(now - time) > 300) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, "hex");

    return (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    );
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.KASERA_WEBHOOK_SECRET;

  if (!process.env.DATABASE_URL || !secret) {
    console.error("Webhook configuration is incomplete.");
    return NextResponse.json(
      { error: "Webhook belum dikonfigurasi." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("Kasera-Signature-V1");

  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json(
      { error: "Tanda tangan tidak valid." },
      { status: 401 },
    );
  }

  let event: any;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON tidak valid." }, { status: 400 });
  }

  const eventId = request.headers.get("Kasera-Event-Id") || event?.id;

  if (
    typeof eventId !== "string" ||
    eventId.length < 1 ||
    eventId.length > 255
  ) {
    return NextResponse.json({ error: "Event ID tidak valid." }, { status: 400 });
  }

  // Hanya izinkan event dari mode sandbox.
  if (event?.livemode !== false) {
    return NextResponse.json(
      { error: "Event bukan dari mode sandbox." },
      { status: 400 },
    );
  }

  if (event?.type !== "payment.paid") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const payment = event?.data;
  const amount = Number(payment?.amount);

  if (
    payment?.status !== "succeeded" ||
    payment?.currency !== "IDR" ||
    typeof payment?.external_id !== "string" ||
    !Number.isSafeInteger(amount) ||
    amount < 1
  ) {
    return NextResponse.json(
      { error: "Data pembayaran tidak valid." },
      { status: 400 },
    );
  }

  let client: import("pg").PoolClient | undefined;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "KaseraWebhookEvent" (
        "eventId" TEXT PRIMARY KEY,
        "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    client = await pool.connect();
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO "KaseraWebhookEvent" ("eventId")
       VALUES ($1)
       ON CONFLICT ("eventId") DO NOTHING
       RETURNING "eventId"`,
      [eventId],
    );

    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true, duplicate: true });
    }

    const orderResult = await client.query(
      `SELECT "id", "status", "totalPrice", "robuxAmount"
       FROM "Order"
       WHERE "id" = $1
       FOR UPDATE`,
      [payment.external_id],
    );

    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Pesanan tidak ditemukan." },
        { status: 404 },
      );
    }

    const order = orderResult.rows[0];

    if (Number(order.totalPrice) !== amount) {
      await client.query("ROLLBACK");
      console.error("Kasera amount mismatch for order:", payment.external_id);
      return NextResponse.json(
        { error: "Nominal pembayaran tidak cocok." },
        { status: 400 },
      );
    }

    if (["PAID", "PROCESSING", "COMPLETED"].includes(order.status)) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true, alreadyPaid: true });
    }

    if (!["PENDING", "EXPIRED", "FAILED"].includes(order.status)) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true, ignored: true });
    }

    // Pesanan EXPIRED/FAILED mungkin sudah melepas reservasi stok.
    if (["EXPIRED", "FAILED"].includes(order.status)) {
      const configResult = await client.query(
        `SELECT "id", "totalStock", "reservedStock"
         FROM "StoreConfig" ORDER BY "id" LIMIT 1 FOR UPDATE`,
      );

      if (configResult.rowCount === 0) {
        throw new Error("StoreConfig row not found");
      }

      const config = configResult.rows[0];
      const availableStock =
        Number(config.totalStock) - Number(config.reservedStock);
      const robuxAmount = Number(order.robuxAmount);

      if (!Number.isSafeInteger(robuxAmount) || robuxAmount <= 0) {
        throw new Error("Invalid Robux amount on order");
      }

      if (robuxAmount > availableStock) {
        await client.query("COMMIT");
        console.error(
          "Late Kasera payment requires manual review; insufficient stock:",
          payment.external_id
        );
        return NextResponse.json({
          received: true,
          requiresManualReview: true
        });
      }

      await client.query(
        `UPDATE "StoreConfig"
         SET "reservedStock" = "reservedStock" + $1,
             "updatedAt" = NOW()
         WHERE "id" = $2`,
        [robuxAmount, config.id],
      );
    }

    await client.query(
      `UPDATE "Order"
       SET "status" = 'PAID',
           "paidAt" = COALESCE("paidAt", NOW()),
           "updatedAt" = NOW()
       WHERE "id" = $1`,
      [payment.external_id],
    );

    await client.query("COMMIT");
    return NextResponse.json({ received: true, paid: true });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    console.error("Kasera webhook processing failed:", error);
    return NextResponse.json(
      { error: "Gagal memproses webhook." },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
