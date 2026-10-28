from pathlib import Path
from datetime import datetime
import re
import shutil
import subprocess
import sys

root = Path.cwd()
order_path = root / "src/app/api/orders/route.ts"
pay_path = root / "src/app/api/payments/create/route.ts"
page_path = root / "src/app/page.tsx"

paths = [order_path, pay_path, page_path]
if not all(p.is_file() for p in paths):
    print("DIBATALKAN: file proyek tidak lengkap.")
    sys.exit(1)

original = {p: p.read_text(encoding="utf-8") for p in paths}
orders, payment, page = [original[p] for p in paths]

def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise ValueError(f"{label}: pola ditemukan {count} kali, seharusnya 1.")
    return text.replace(old, new, 1)

try:
    # Jangan menerapkan ulang patch yang sudah lengkap.
    if (
        "randomBytes(32)" in orders
        and "statusTokenHash" in orders
        and "status-pesanan#token=" in payment
        and "body: JSON.stringify({ orderId, statusToken })" in page
    ):
        print("Integrasi token sudah tampak lengkap; tidak ada perubahan.")
        sys.exit(0)

    if (
        "randomBytes(32)" in orders
        or "status-pesanan#token=" in payment
        or "statusToken" in page
    ):
        raise ValueError("Patch tampak sudah diterapkan sebagian; perlu pemeriksaan manual.")

    # API pesanan: impor fungsi kriptografi.
    orders = once(
        orders,
        'import { randomUUID } from "node:crypto";',
        'import { randomUUID, randomBytes, createHash } from "node:crypto";',
        "Impor crypto API pesanan"
    )

    # Buat token dan simpan kolom hash di DB sebelum INSERT, dalam transaksi yang sama.
    orders = once(
        orders,
        "const orderId = randomUUID();",
        """const statusToken = randomBytes(32).toString("base64url");
    const statusTokenHash = createHash("sha256").update(statusToken).digest("hex");
    await client.query('ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "statusTokenHash" TEXT');

    const orderId = randomUUID();""",
        "Pembuatan token"
    )

    # Ganti hanya statement INSERT pesanan, dengan daftar kolom/nilai yang sepadan.
    pattern = re.compile(
        r'await client\.query\(\s*`INSERT INTO "Order"[\s\S]*?`\s*,\s*\[[\s\S]*?\]\s*\);'
    )
    replacement = """await client.query(
      `INSERT INTO "Order"
        (id, "robloxUsername", "robuxAmount", "pricePerRobux",
         "totalPrice", "buyerEmail", "buyerWhatsapp", "statusTokenHash", status,
         "createdAt", "updatedAt", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING',
               NOW(), NOW(), NOW() + INTERVAL '30 minutes')`,
      [
        orderId,
        username,
        amount,
        pricePerRobux,
        totalPrice,
        buyerEmail,
        buyerWhatsapp,
        statusTokenHash,
      ]
    );"""
    orders, count = pattern.subn(replacement, orders, count=1)
    if count != 1:
        raise ValueError("Statement INSERT Order tidak cocok.")

    expiry = "expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),"
    orders = once(
        orders, expiry, expiry + "\n          statusToken,", "Respons API pesanan"
    )

    # API pembayaran: terima token dari checkout.
    payment = once(
        payment,
        'import { NextResponse } from "next/server";',
        'import { NextResponse } from "next/server";\nimport { createHash } from "node:crypto";',
        "Impor crypto API pembayaran"
    )
    payment = once(
        payment,
        "let body: { orderId?: unknown };",
        "let body: { orderId?: unknown; statusToken?: unknown };",
        "Tipe body pembayaran"
    )

    # Pastikan token valid sebelum mencari/memproses pesanan.
    payment = once(
        payment,
        "let order;",
        """const statusToken = body.statusToken;
  if (typeof statusToken !== "string" || statusToken.length < 40 || statusToken.length > 100) {
    return NextResponse.json({ error: "Token status tidak valid." }, { status: 400 });
  }

  let order;""",
        "Validasi token pembayaran"
    )

    # Ambil hash token bersama kolom pesanan.
    payment = once(
        payment,
        '"totalPrice", status, "expiresAt"',
        '"totalPrice", status, "expiresAt", "statusTokenHash"',
        "SELECT hash token"
    )

    # Temukan blok pemeriksaan PENDING dengan regex, tidak bergantung pada spasi tertentu.
    pending = re.search(
        r'(?m)^([ \t]*)if\s*\(\s*\n[ \t]*order\.status\s*!==\s*"PENDING"',
        payment
    )
    if not pending:
        raise ValueError("Blok validasi PENDING tidak ditemukan.")
    indent = pending.group(1)
    guard = (
        f'{indent}if (typeof order.statusTokenHash !== "string" || '
        'createHash("sha256").update(statusToken).digest("hex") !== order.statusTokenHash) {\n'
        f'{indent}  return NextResponse.json({{ error: "Token tidak cocok dengan pesanan." }}, {{ status: 403 }});\n'
        f'{indent}}}\n\n'
    )
    payment = payment[:pending.start()] + guard + payment[pending.start():]

    payment = once(
        payment,
        'return_url: "https://robux-store-ashen.vercel.app/",',
        'return_url: `https://robux-store-ashen.vercel.app/status-pesanan#token=${encodeURIComponent(statusToken)}`,',
        "URL kembali Kasera"
    )

    # Checkout: teruskan token dari API pesanan ke API pembayaran.
    payment_marker = '        const paymentResponse = await fetch("/api/payments/create", {'
    page = once(
        page,
        payment_marker,
        """        const statusToken = orderData.statusToken;
        if (typeof statusToken !== "string" || statusToken.length < 40) {
          throw new Error("Token status pesanan tidak tersedia.");
        }

""" + payment_marker,
        "Penerusan token dari checkout"
    )
    page = once(
        page,
        "body: JSON.stringify({ orderId }),",
        "body: JSON.stringify({ orderId, statusToken }),",
        "Body API pembayaran"
    )

except ValueError as e:
    print("DIBATALKAN sebelum file ditulis:", e)
    print("File proyek tidak diubah.")
    sys.exit(1)

# Cadangkan dahulu file yang akan berubah.
backup = root / ("backup-status-final-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
backup.mkdir(parents=True)
for p in paths:
    dest = backup / p.relative_to(root)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)

try:
    for p, content in zip(paths, [orders, payment, page]):
        p.write_text(content, encoding="utf-8")
except Exception as e:
    for p, content in original.items():
        p.write_text(content, encoding="utf-8")
    print("Penulisan gagal; file dipulihkan:", e)
    sys.exit(1)

print("Backup:", backup)
print("Patch ditulis. Menjalankan build...")
result = subprocess.run(["npm", "run", "build"])

if result.returncode != 0:
    print("BUILD GAGAL. Memulihkan file asli...")
    for p, content in original.items():
        p.write_text(content, encoding="utf-8")
    print("Pemulihan selesai. Backup tetap tersedia:", backup)
    sys.exit(result.returncode)

print("\nBUILD BERHASIL.")
print("File proyek sudah berubah. Belum push atau deploy.")
print("Backup tersedia:", backup)
