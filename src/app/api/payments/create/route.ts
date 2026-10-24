import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

const globalForPool = globalThis as unknown as {
  paymentPool?: Pool;
};

const pool =
  globalForPool.paymentPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.paymentPool = pool;
}

export async function POST(request: Request) {
  const apiKey = process.env.KASERA_PAY_KEY;

  if (!apiKey || !apiKey.startsWith("kp_test_")) {
    return NextResponse.json(
      { error: "API key test Kasera Pay belum dikonfigurasi." },
      { status: 503 }
    );
  }

  let body: { orderId?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  if (
    typeof body.orderId !== "string" ||
    body.orderId.length > 100
  ) {
    return NextResponse.json(
      { error: "ID pesanan tidak valid." },
      { status: 400 }
    );
  }

  let order;

  try {
    const result = await pool.query(
      `SELECT id, "robuxAmount", "totalPrice", status, "expiresAt"
       FROM "Order"
       WHERE id = $1
       LIMIT 1`,
      [body.orderId]
    );

    order = result.rows[0];
  } catch (error) {
    console.error("Read order for checkout failed:", error);
    return NextResponse.json(
      { error: "Gagal memeriksa pesanan." },
      { status: 500 }
    );
  }

  if (!order) {
    return NextResponse.json(
      { error: "Pesanan tidak ditemukan." },
      { status: 404 }
    );
  }

  if (
    order.status !== "PENDING" ||
    !order.expiresAt ||
    new Date(order.expiresAt).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: "Pesanan sudah tidak aktif atau telah kedaluwarsa." },
      { status: 409 }
    );
  }

  const amount = Number(order.totalPrice);
  const robuxAmount = Number(order.robuxAmount);

  if (
    !Number.isSafeInteger(amount) ||
    amount < 1000 ||
    !Number.isSafeInteger(robuxAmount) ||
    robuxAmount < 10 ||
    robuxAmount > 10000
  ) {
    return NextResponse.json(
      { error: "Nominal pesanan tidak valid." },
      { status: 400 }
    );
  }

  const payload = {
    amount,
    description: `Robux Store - ${robuxAmount} Robux`,
    external_id: order.id,
    merchant_ref: order.id,
    payment_methods: ["qris"],
    return_url: "https://robux-store-ashen.vercel.app/",
    expires_in_minutes: 30,
  };

  let response: Response;

  try {
    response = await fetch(
      "https://pay.kasera.id/v1/transactions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": order.id,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );
  } catch (error) {
    console.error("Kasera checkout request failed:", error);
    return NextResponse.json(
      { error: "Kasera Pay tidak dapat dihubungi. Coba lagi nanti." },
      { status: 502 }
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Kasera checkout rejected:", response.status);
    return NextResponse.json(
      { error: "Kasera Pay menolak permintaan checkout." },
      { status: 502 }
    );
  }

  if (
    data?.livemode !== false ||
    typeof data?.checkout_url !== "string" ||
    typeof data?.id !== "string"
  ) {
    console.error("Unexpected Kasera test response.");
    return NextResponse.json(
      { error: "Respons test Kasera Pay tidak sesuai." },
      { status: 502 }
    );
  }

  let checkoutUrl: URL;

  try {
    checkoutUrl = new URL(data.checkout_url);
  } catch {
    return NextResponse.json(
      { error: "Link checkout tidak valid." },
      { status: 502 }
    );
  }

  if (checkoutUrl.origin !== "https://pay.kasera.id") {
    return NextResponse.json(
      { error: "Domain checkout tidak diizinkan." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    orderId: order.id,
    status: "PENDING",
    checkoutUrl: checkoutUrl.toString(),
    expiresAt: data.expires_at ?? null,
  });
}
