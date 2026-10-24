import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

const COOKIE_NAME = "robux_admin_session";
const SESSION_SECONDS = 60 * 60 * 8;

function secret() {
  return process.env.ADMIN_SESSION_SECRET || "";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function createAdminCookieValue() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `admin:${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function isAdminRequest(request: NextRequest) {
  if (!secret()) return false;
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const lastDot = raw.lastIndexOf(".");
  if (lastDot < 1) return false;
  const payload = raw.slice(0, lastDot);
  const signature = raw.slice(lastDot + 1);
  const parts = payload.split(":");
  if (parts.length !== 2 || parts[0] !== "admin") return false;
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(payload), "hex");
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const adminCookieName = COOKIE_NAME;
export const adminSessionSeconds = SESSION_SECONDS;
export function adminAuthConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12 && secret().length >= 32);
}
