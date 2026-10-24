import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminAuthConfigured, adminCookieName, adminSessionSeconds, createAdminCookieValue } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!adminAuthConfigured()) {
    return NextResponse.json({ error: "Admin belum dikonfigurasi. Atur ADMIN_PASSWORD dan ADMIN_SESSION_SECRET di environment." }, { status: 503 });
  }

  let body: { password?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const supplied = typeof body.password === "string" ? Buffer.from(body.password) : Buffer.from("");
  const expected = Buffer.from(process.env.ADMIN_PASSWORD || "");
  const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!matches) {
    return NextResponse.json({ error: "Password admin salah." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, createAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: adminSessionSeconds,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
