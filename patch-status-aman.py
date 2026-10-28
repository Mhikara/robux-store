from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path.cwd()
files = [
    "src/app/api/orders/route.ts",
    "src/app/api/payments/create/route.ts",
    "src/app/api/orders/status/route.ts",
    "src/app/status-pesanan/page.tsx",
    "src/app/page.tsx",
    "prisma/schema.prisma",
]

missing = [f for f in files if not (root / f).is_file()]
if missing:
    print("DIBATALKAN: file berikut tidak ditemukan:")
    print("\n".join(missing))
    sys.exit(1)

orders = (root / files[0]).read_text(encoding="utf-8")
payment = (root / files[1]).read_text(encoding="utf-8")
status_api = (root / files[2]).read_text(encoding="utf-8")
checkout = (root / files[4]).read_text(encoding="utf-8")
schema = (root / files[5]).read_text(encoding="utf-8")

checks = {
    "API pesanan menyimpan Order": 'INSERT INTO "Order"' in orders,
    "API pembayaran menggunakan return_url": "return_url:" in payment,
    "API status memvalidasi token hash": "statusTokenHash" in status_api,
    "Halaman checkout punya fungsi checkout": "async function checkout" in checkout,
    "Schema memiliki statusTokenHash": "statusTokenHash" in schema,
}

print("=== HASIL PEMERIKSAAN ===")
for label, ok in checks.items():
    print(("OK   " if ok else "GAGAL ") + label)

if not all(checks.values()):
    print("\nDIBATALKAN: struktur kode tidak sesuai. Tidak ada file yang diubah.")
    sys.exit(1)

backup = root.parent / (
    "robux-store-backup-status-" + datetime.now().strftime("%Y%m%d-%H%M%S")
)
backup.mkdir(parents=True, exist_ok=False)

for name in files:
    dest = backup / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, dest)

print("\nBackup dibuat:", backup)
print("Belum ada kode yang diubah.")
print("Berikutnya perlu patch yang menyambungkan token saat INSERT, checkout, dan return_url.")
