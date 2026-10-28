from pathlib import Path
from datetime import datetime
import shutil
import sys

root = Path.cwd()
orders = root / "src/app/api/orders/route.ts"
payment = root / "src/app/api/payments/create/route.ts"
page = root / "src/app/page.tsx"
status_api = root / "src/app/api/orders/status/route.ts"
schema = root / "prisma/schema.prisma"

required = [orders, payment, page, status_api, schema]
missing = [str(p.relative_to(root)) for p in required if not p.is_file()]
if missing:
    print("DIBATALKAN. File tidak ditemukan:")
    print("\n".join(missing))
    sys.exit(1)

o = orders.read_text(encoding="utf-8")
p = payment.read_text(encoding="utf-8")
f = page.read_text(encoding="utf-8")
s = status_api.read_text(encoding="utf-8")
m = schema.read_text(encoding="utf-8")

checks = {
    "API order memakai transaksi PostgreSQL": 'INSERT INTO "Order"' in o and 'COMMIT' in o,
    "Kolom hash token sudah di skema": 'statusTokenHash' in m,
    "API status memvalidasi SHA-256": 'createHash("sha256")' in s and '"statusTokenHash"' in s,
    "Checkout membaca orderId": 'body.orderId' in p,
    "Checkout punya return_url": 'return_url:' in p,
    "Halaman punya fungsi checkout": 'async function checkout()' in f,
    "Checkout mengarahkan ke Kasera": 'window.location.href = checkoutUrl' in f,
}
print("=== PEMERIKSAAN ===")
for label, ok in checks.items():
    print(("OK  " if ok else "GAGAL ") + label)

if not all(checks.values()):
    print("\nDIBATALKAN: pola kode tidak cocok. Tidak ada file yang diubah.")
    sys.exit(1)

# Hindari menerapkan patch berulang atau menebak posisi SQL.
if 'randomBytes' in o and 'statusToken:' in o:
    print("\nToken tampaknya sudah diterapkan. Tidak ada file yang diubah.")
    sys.exit(0)

backup = root.parent / (
    "robux-store-backup-status-" + datetime.now().strftime("%Y%m%d-%H%M%S")
)
backup.mkdir(parents=True, exist_ok=False)
for path in required:
    dest = backup / path.relative_to(root)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

print("\nBackup dibuat:", backup)
print("Belum ada kode yang diubah.")
print(
    "\nPemeriksaan lolos, tetapi patch otomatis belum diterapkan karena "
    "perubahan SQL dan return_url harus disesuaikan dengan transaksi serta "
    "validasi token yang sebenarnya. Tidak ada file yang diubah."
)
