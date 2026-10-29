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

type OrderRow = {
  id: string;
  robloxUsername: string;
  robuxAmount: number;
  totalPrice: number;
  buyerWhatsapp: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
};

type Summary = {
  total: number;
  pending: number;
  paid: number;
  processing: number;
  completed: number;
  failedOrExpired: number;
  totalSales: number;
  reservedRobux: number;
};

const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const statusLabel: Record<string, string> = {
  PENDING: "Menunggu bayar",
  PAID: "Sudah bayar",
  PROCESSING: "Diproses",
  COMPLETED: "Selesai",
  EXPIRED: "Kedaluwarsa",
  FAILED: "Gagal",
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [totalStock, setTotalStock] = useState("100");
  const [price, setPrice] = useState("160");
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [summary, setSummary] = useState**Summary:**
(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  async function loadOrders(q = searchQ, st = filterStatus) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (st) params.set("status", st);
    const response = await fetch(`/api/admin/orders?${params}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gagal memuat pesanan.");
    setOrders(data.orders || []);
    setSummary(data.summary || null);
  }

  async function loadConfig() {
    const response = await fetch("/api/admin/config", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gagal memuat pengaturan.");
    setConfig(data);
    setTotalStock(String(data.totalStock));
    setPrice(String(data.pricePerRobux));
    setLoggedIn(true);
    await loadOrders();
  }

  useEffect(() => {
    void loadConfig().catch(() => {});
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
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
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalStock: Number(totalStock),
          pricePerRobux: Number(price),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan.");
      setConfig(data);
      setMessage("Pengaturan stok dan harga berhasil disimpan ke database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function updateOrderStatus(orderId: string, status: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal update status.");
      setMessage(`Status pesanan diubah ke ${status}.`);
      await loadOrders();
      await loadConfig();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal update.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setLoggedIn(false);
    setConfig(null);
    setOrders([]);
    setSummary(null);
    setMessage("Kamu sudah keluar.");
  }

  return (
    <main className="min-h-screen bg-[#090b12] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold tracking-widest text-violet-400">
              ROBUX STORE
            </p>
            <h1 className="mt-1 text-3xl font-black">Panel Admin</h1>
            <p className="mt-2 text-sm text-slate-400">
              Atur stok, harga, dan pesanan.
            </p>
          </div>
          {loggedIn && (
            <button
              onClick={logout}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm"
            >
              Keluar
            </button>
          )}
        </header>

        {!loggedIn ? (
          <form
            onSubmit={login}
            className="rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"
          >
            <h2 className="text-xl font-bold">Login admin</h2>
            <p className="mt-2 text-sm text-slate-400">
              Masukkan password admin yang disimpan di environment Vercel.
            </p>
            <label className="mb-2 mt-5 block text-sm">Password admin</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 outline-none focus:border-violet-500"
            />
            <button
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-50"
            >
              {busy ? "Memeriksa..." : "Login"}
            </button>
          </form>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#111521] p-5">
                <p className="text-sm text-slate-400">Total stok</p>
                <p className="mt-2 text-3xl font-black">
                  {config?.totalStock.toLocaleString("id-ID") ?? "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111521] p-5">
                <p className="text-sm text-slate-400">Stok dipesan</p>
                <p className="mt-2 text-3xl font-black">
                  {config?.reservedStock.toLocaleString("id-ID") ?? "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
                <p className="text-sm text-slate-400">Sisa tersedia</p>
                <p className="mt-2 text-3xl font-black text-emerald-300">
                  {config?.availableStock.toLocaleString("id-ID") ?? "—"}
                </p>
              </div>
            </section>

            <form
              onSubmit={save}
              className="mt-5 rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7"
            >
              <h2 className="text-xl font-bold">Pengaturan toko</h2>
              <label className="mb-2 mt-5 block text-sm">Total stok Robux</label>
              <input
                type="number"
                min="0"
                max="100000000"
                step="1"
                required
                value={totalStock}
                onChange={(e) => setTotalStock(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 outline-none focus:border-violet-500"
              />
              <label className="mb-2 mt-5 block text-sm">
                Harga per Robux (Rp)
              </label>
              <input
                type="number"
                min="1"
                max="100000000"
                step="1"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 outline-none focus:border-violet-500"
              />
              <div className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-slate-300">
                Minimal pembelian tetap <strong>10 Robux</strong>. Harga paket
                minimal:{" "}
                <strong>
                  {money(Math.max(0, Number(price) || 0) * 10)}
                </strong>
                .
              </div>
              <button
                disabled={busy}
                className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-50"
              >
                {busy ? "Menyimpan..." : "Simpan pengaturan"}
              </button>
            </form>

            <section className="mt-5 rounded-2xl border border-white/10 bg-[#111521] p-5 sm:p-7">
              <h2 className="text-xl font-bold">Pesanan</h2>
              {summary && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg bg-white/5 p-3">
                    Total: <strong>{summary.total}</strong>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    Pending: <strong>{summary.pending}</strong>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    Paid: <strong>{summary.paid}</strong>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    Proses: <strong>{summary.processing}</strong>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    Selesai: <strong>{summary.completed}</strong>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    Gagal/Exp: <strong>{summary.failedOrExpired}</strong>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    Penjualan: <strong>{money(summary.totalSales)}</strong>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    Reserved R$: <strong>{summary.reservedRobux}</strong>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Cari username atau ID pesanan"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 text-sm outline-none focus:border-violet-500"
                />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#090d17] px-3 py-3 text-sm"
                >
                  <option value="">Semua status</option>
                  {Object.keys(statusLabel).map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadOrders(searchQ, filterStatus)}
                  className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold"
                >
                  Cari
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {orders.length === 0 && (
                  <p className="text-sm text-slate-400">Tidak ada pesanan.</p>
                )}
                {orders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-xl border border-white/10 bg-[#090d17] p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">@{o.robloxUsername}</p>
                        <p className="mt-1 break-all text-xs text-slate-500">
                          {o.id}
                        </p>
                      </div>
                      <span className="rounded-lg bg-violet-500/20 px-2 py-1 text-xs font-bold text-violet-200">
                        {statusLabel[o.status] || o.status}
                      </span>
                    </div>
                    <p className="mt-2 text-slate-300">
                      {o.robuxAmount.toLocaleString("id-ID")} Robux ·{" "}
                      {money(Number(o.totalPrice))}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(o.createdAt).toLocaleString("id-ID")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(o.status === "PAID" || o.status === "PROCESSING") && (
                        <>
                          {o.status === "PAID" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void updateOrderStatus(o.id, "PROCESSING")
                              }
                              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold"
                            >
                              Proses
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void updateOrderStatus(o.id, "COMPLETED")
                            }
                            className="rounded-lg bg-emerald-600/80 px-3 py-2 text-xs font-bold"
                          >
                            Selesai
                          </button>
                        </>
                      )}
                      {["PENDING", "PAID", "PROCESSING", "EXPIRED"].includes(
                        o.status
                      ) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void updateOrderStatus(o.id, "FAILED")
                          }
                          className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-bold text-red-200"
                        >
                          Gagal
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {message && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-white/10 bg-[#111521] p-4 text-sm text-slate-200"
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
