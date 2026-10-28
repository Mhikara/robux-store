from pathlib import Path
import shutil, datetime, sys

root = Path.cwd()
files = [
    Path("src/app/api/orders/route.ts"),
    Path("src/app/api/payments/create/route.ts"),
    Path("src/app/page.tsx"),
    Path("src/app/api/orders/status/route.ts"),
    Path("src/app/status-pesanan/page.tsx"),
    Path("prisma/schema.prisma"),
]

missing = [str(p) for p in files if not (root / p).is_file()]
if missing:
    print("DIBATALKAN, file tidak ditemukan:")
    print("\n".join(missing))
    sys.exit(1)

orders = (root / files[0]).read_text()
payment = (root / files[1]).read_text()
page = (root / files[2]).read_text()
status_api = (root / files[3]).read_text()
status_page = (root / files[4]).read_text()
schema = (root / files[5]).read_text()

checks = {
    "API pesanan membuat ID": "randomUUID()" in orders,
    "API pesanan memakai transaksi": 'INSERT INTO "Order"' in orders and 'COMMIT' in orders,
    "API status membaca hash token": 'createHash("sha256")' in status_api and '"statusTokenHash"' in status_api,
    "Checkout membuat pesanan": 'fetch("/api/orders"' in page,
    "Checkout membuat pembayaran": 'fetch("/api/payments/create"' in page,
    "Kasera membatasi domain checkout": 'https://pay.kasera.id' in payment,
    "Skema punya kolom hash token": "statusTokenHash" in schema,
}
print("=== PEMERIKSAAN ===")
for label, ok in checks.items():
    print(("OK  " if ok else "GAGAL ") + label)

if not all(checks.values()):
    print("\nDibatalkan. Tidak ada file yang diubah.")
    sys.exit(1)

if "randomBytes" in orders and "statusToken:" in orders:
    print("\nToken tampaknya sudah ditambahkan. Tidak mengubah file.")
    sys.exit(0)

print("\nPemeriksaan awal lolos, tetapi perubahan otomatis belum diterapkan.")
print("Alur INSERT pesanan dan return_url perlu dipatch berdasarkan SQL lengkap.")
print("Tidak ada file proyek yang diubah.")
