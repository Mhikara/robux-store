 "use client";

import { useEffect, useState, type FormEvent } from "react";

type AdminConfig = {
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  pricePerRobux: number;
  minimumPurchase: number;
  updatedAt?: string;
};

const money = (n: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(n);

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [totalStock, setTotalStock] = useState("100");
  const [price, setPrice] = useState("160");
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadConfig() {
    const response = await fetch("/api/admin/config", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gagal memuat pengaturan.");
    setConfig(data);
    setTotalStock(String(data.totalStock));
    setPrice(String(data.pricePerRobux));
    setLoggedIn(true);
  }

  useEffect(() => {
    void loadConfig().catch(() => {});
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login gagal.");
      setPassword("");
      await loadConfig();
      setMessage("Login admin berhasil.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login gagal.");
    } finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalStock: Number(totalStock), pricePerRobux: Number(price) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan.");
      setConfig(data);
      setMessage("Pengaturan stok dan harga berhasil disimpan ke database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setLoggedIn(false); setConfig(null); setMessage("Kamu sudah keluar.");
  }

  return (
    <main className="min-h-screen bg-[#090b12] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold tracking-widest text-violet-400">ROBUX STORE</p>
            <h1 className="mt-1 text-3xl font-black">Panel Admin</h1>
            <p className="mt-2 text-sm text-slate-400">Atur stok dan harga toko.</p>
          </div>
          {loggedIn && <button onClick={logout} className="rounded-xl border border-white/15 px-4 py-2 text-sm">Keluar</button>}
        </header>

        {!loggedIn ? (
          <form onSubmit={login} className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7">
            <h2 className="text-xl font-bold">Login admin</h2>
            <p className="mt-2 text-sm text-slate-400">Masukkan password admin yang disimpan di environment Vercel.</p>
            <label className="mb-2 mt-5 block text-sm">Password admin</label>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 outline-none focus:border-violet-500" />
            <button disabled={busy} className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-50">{busy ? "Memeriksa..." : "Login"}</button>
          </form>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#111521] p-5">
                <p className="text-sm text-slate-400">Total stok</p>
                <p className="mt-2 text-3xl font-black">{config?.totalStock.toLocaleString("id-ID") ?? "—"}</p>
                <p className="text-xs text-slate-500">Robux</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111521] p-5">
                <p className="text-sm text-slate-400">Stok dipesan</p>
                <p className="mt-2 text-3xl font-black">{config?.reservedStock.toLocaleString("id-ID") ?? "—"}</p>
                <p className="text-xs text-slate-500">Reservasi aktif/tertahan</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
                <p className="text-sm text-slate-400">Sisa stok tersedia</p>
                <p className="mt-2 text-3xl font-black text-emerald-300">{config?.availableStock.toLocaleString("id-ID") ?? "—"}</p>
                <p className="text-xs text-slate-500">Total dikurangi dipesan</p>
              </div>
            </section>

            <form onSubmit={save} className="mt-5 rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7">
              <h2 className="text-xl font-bold">Pengaturan toko</h2>
              <label className="mb-2 mt-5 block text-sm">Total stok Robux</label>
              <input type="number" min="0" max="100000000" step="1" required value={totalStock} onChange={(e) => setTotalStock(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 outline-none focus:border-violet-500" />
              <label className="mb-2 mt-5 block text-sm">Harga per Robux (Rp)</label>
              <input type="number" min="1" max="100000000" step="1" required value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 outline-none focus:border-violet-500" />
              <div className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-300">
                Minimal pembelian tetap <strong>10 Robux</strong>. Harga paket minimal: <strong>{money(Math.max(0, Number(price) || 0) * 10)}</strong>. Maksimal pembelian otomatis mengikuti sisa stok.
              </div>
              <button disabled={busy} className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan pengaturan"}</button>
            </form>
          </>
        )}
        {message && <p role="status" className="mt-4 rounded-xl border border-white/10 bg-[#111521] p-4 text-sm text-slate-200">{message}</p>}
        <p className="mt-6 text-xs leading-5 text-slate-500">Panel dilindungi sesi admin HTTP-only. Jangan bagikan password admin. Stok total tidak dapat disetel lebih rendah daripada stok yang sedang dipesan.</p>
      </div>
    </main>
  );
}
