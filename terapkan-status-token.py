from pathlib import Path
from datetime import datetime
import re, shutil, subprocess, sys

root = Path.cwd()
order_file = root / "src/app/api/orders/route.ts"
pay_file = root / "src/app/api/payments/create/route.ts"
page_file = root / "src/app/page.tsx"

paths = [order_file, pay_file, page_file]
if not all(p.is_file() for p in paths):
    print("DIBATALKAN: ada file proyek yang tidak ditemukan.")
    sys.exit(1)

original = {p: p.read_text(encoding="utf-8") for p in paths}
orders, payment, page = [original[p] for p in paths]

if (
    "randomBytes(32)" in orders
    and "statusTokenHash" in orders
    and "status-pesanan#token=" in payment
    and "body: JSON.stringify({ orderId, statusToken })" in page
):
    print("Integrasi token tampaknya sudah diterapkan.")
    print("Tidak ada perubahan baru.")
    sys.exit(0)

if "randomBytes(32)" in orders or "status-pesanan#token=" in payment:
    print("DIBATALKAN: integrasi tampaknya sudah diterapkan sebagian.")
    print("Tidak ada file yang diubah; perlu pemeriksaan manual.")
    sys.exit(1)

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise ValueError(f"Pola '{label}' ditemukan {count} kali, perlu tepat 1.")
    return text.replace(old, new, 1)

try:
    # 1. API order: buat token acak, simpan hash dalam transaksi yang sama.
    orders = replace_once(
        orders,
        'import { randomUUID } from "node:crypto";',
        'import { randomUUID, randomBytes, createHash } from "node:crypto";',
        "import crypto"
    )

    orders = replace_once(
        orders,
        "const orderId = randomUUID();",
        """const statusToken = randomBytes(32).toString("base64url");
    const statusTokenHash = createHash("sha256").update(statusToken).digest("hex");
    await client.query('ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "statusTokenHash" TEXT');

    const orderId = randomUUID();""",
        "pembuatan token"
    )

    # Tambah kolom hash ke INSERT.
    pattern = r'("totalPrice",\s*"buyerEmail",\s*"buyerWhatsapp",)\s*status,'
    orders, n = re.subn(pattern, r'\1 "statusTokenHash", status,', orders, count=1)
    if n != 1:
        raise ValueError("Kolom INSERT Order tidak cocok.")

    pattern = r"(VALUES\s*\(\$1,\s*\$2,\s*\$3,\s*\$4,\s*\$5,\s*\$6,\s*\$7,)\s*'PENDING',"
    orders, n = re.subn(pattern, r"\1 $8, 'PENDING',", orders, count=1)
    if n != 1:
        raise ValueError("Daftar VALUES INSERT tidak cocok.")

    start = orders.index('INSERT INTO "Order"')
    end = orders.index('"UPDATE "StoreConfig"', start) if '"UPDATE "StoreConfig"' in orders[start:] else -1
    if end < 0:
        end = orders.index('UPDATE "StoreConfig"', start)
    block = orders[start:end]
    block, n = re.subn(
        r'(buyerWhatsapp,\s*)\n(\s*)\]',
        r'\1\n\2statusTokenHash,\n\2]',
        block,
        count=1
    )
    if n != 1:
        raise ValueError("Array nilai INSERT tidak cocok.")
    orders = orders[:start] + block + orders[end:]

    # Kembalikan token asli ke klien sekali saja untuk membuat tautan status.
    pattern = r'^([ \t]*)expiresAt: new Date\(Date\.now\(\) \+ 30 \* 60 \* 1000\)\.toISOString\(\),$'
    orders, n = re.subn(
        pattern,
        lambda m: m.group(0) + "\n" + m.group(1) + "statusToken,",
        orders,
        count=1,
        flags=re.M
    )
    if n != 1:
        raise ValueError("Properti expiresAt pada respons order tidak cocok.")

    # 2. API pembayaran: wajib menerima dan memvalidasi token untuk order itu.
    payment = replace_once(
        payment,
        'import { NextResponse } from "next/server";',
        'import { NextResponse } from "next/server";\nimport { createHash } from "node:crypto";',
        "import crypto pembayaran"
    )
    payment = replace_once(
        payment,
        "let body: { orderId?: unknown };",
        "let body: { orderId?: unknown; statusToken?: unknown };",
        "tipe body pembayaran"
    )

    marker = "\n  let order;"
    if payment.count(marker) != 1:
        raise ValueError("Lokasi validasi sebelum pembacaan order tidak cocok.")
    payment = payment.replace(
        marker,
        """
  if (
    typeof body.statusToken !== "string" ||
    body.statusToken.length < 40 ||
    body.statusToken.length > 100
  ) {
    return NextResponse.json({ error: "Token status tidak valid." }, { status: 400 });
  }
  const statusToken = body.statusToken;
""" + marker,
        1
    )

    payment = replace_once(
        payment,
        '"totalPrice", status, "expiresAt"',
        '"totalPrice", status, "expiresAt", "statusTokenHash"',
        "SELECT hash token"
    )

    marker = 'if (\\n    order.status !== "PENDING"'
    if marker not in payment:
        raise ValueError("Pemeriksaan status PENDING tidak ditemukan.")
    payment = payment.replace(
        marker,
        """if (
    typeof order.statusTokenHash !== "string" ||
    createHash("sha256").update(statusToken).digest("hex") !== order.statusTokenHash
  ) {
    return NextResponse.json({ error: "Token tidak cocok dengan pesanan." }, { status: 403 });
  }

  if (
    order.status !== "PENDING" """.rstrip(),
        1
    )

    payment = replace_once(
        payment,
        'return_url: "https://robux-store-ashen.vercel.app/",',
        'return_url: `https://robux-store-ashen.vercel.app/status-pesanan#token=${encodeURIComponent(statusToken)}`,',
        "return_url status"
    )

    # 3. Checkout: teruskan token dari API order ke API pembayaran.
    marker = '        const paymentResponse = await fetch("/api/payments/create", {'
    if page.count(marker) != 1:
        raise ValueError("Lokasi checkout API pembayaran tidak cocok.")
    page = page.replace(
        marker,
        """        const statusToken = orderData.statusToken;
        if (typeof statusToken !== "string" || statusToken.length < 40) {
          throw new Error("Token status pesanan tidak tersedia.");
        }

""" + marker,
        1
    )
    page = replace_once(
        page,
        "body: JSON.stringify({ orderId }),",
        "body: JSON.stringify({ orderId, statusToken }),",
        "payload checkout"
    )

except (ValueError, IndexError) as e:
    print("DIBATALKAN sebelum menulis file:", e)
    print("File proyek tidak diubah.")
    sys.exit(1)

# Backup ketiga file sebelum menulis.
backup = root / ("backup-status-token-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
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
print("Patch diterapkan. Menjalankan build...")

result = subprocess.run(["npm", "run", "build"])
if result.returncode != 0:
    print("BUILD GAGAL. Memulihkan file yang diubah dari backup.")
    for p, content in original.items():
        p.write_text(content, encoding="utf-8")
    print("File dipulihkan. Backup tetap tersedia:", backup)
    sys.exit(result.returncode)

print("BUILD BERHASIL.")
print("Belum melakukan git push atau deploy.")
print("Berikutnya perlu memeriksa diff sebelum mengirim perubahan.")
