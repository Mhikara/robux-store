"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Order = {
  id: string;
  username: string;
  robuxAmount: number;
  pricePerRobux: number;
  totalPrice: number;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
};

const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const labels: Record<string, string> = {
  PENDING: "Menunggu pembayaran",
  PAID: "Pembayaran terverifikasi",
  PROCESSING: "Robux sedang diproses",
  COMPLETED: "Pesanan selesai",
  EXPIRED: "Pesanan kedaluwarsa",
  FAILED: "Pembayaran gagal",
};

export default function StatusPesanan() {
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialDone, setInitialDone] = useState(false);

  const loadByToken = useCallback(async (token: string) => {
    setLoading(true);
    setError("");
    setEmpty(false);
    try {
      const r = await fetch("/api/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) {
        setOrders([]);
        setEmpty(true);
        setError(d.message || d.error || "Tidak ada data invoice");
        return;
      }
      setOrders(d.orders || (d.order ? [d.order] : []));
    } catch {
      setError("Gagal memuat status.");
      setOrders([]);
    } finally {
      setLoading(false);
      setInitialDone(true);
    }
  }, []);

  const loadByQuery = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    setEmpty(false);
    try {
      const r = await fetch("/api/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok || !(d.orders && d.orders.length)) {
        setOrders([]);
        setEmpty(true);
        setError(
          d.message ||
            "Username atau email yang dimasukkan belum memiliki riwayat transaksi, harap masukkan email & username dengan tepat"
        );
        return;
      }
      setOrders(d.orders);
      setEmpty(false);
    } catch {
      setError("Gagal memuat status.");
      setOrders([]);
      setEmpty(true);
    } finally {
      setLoading(false);
      setInitialDone(true);
    }
  }, []);

  useEffect(() => {
    let t =
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    if (!t) {
      try {
        t = sessionStorage.getItem("robux_status_token") || "";
      } catch {
        t = "";
      }
    }
    if (t && t.length >= 40) {
      void loadByToken(t);
    } else {
      setInitialDone(true);
    }
  }, [loadByToken]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) {
      setEmpty(true);
      setOrders([]);
      setError("Masukkan username Roblox atau email (minimal 3 karakter).");
      return;
    }
    void loadByQuery(query);
  }

  return (
    <main className="min-h-screen bg-[#0b0e14] px-4 py-8 text-white">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <a href="/" className="text-sm text-slate-400">
            ← Beranda
          </a>
        </div>

        <h1 className="text-center text-3xl font-black text-amber-400">
          Cek Pesanan
        </h1>
        <p className="mt-2 text-center text-sm text-slate-300">
          Cek pesanan kamu dengan email ataupun username lalu klik cek
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Masukkan email Atau username"
            className="min-w-0 flex-1 rounded-xl border-0 bg-[#2a2f3a] px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-500/50"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-[#8B6914] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? "..." : "cek"}
          </button>
        </form>

        <hr className="my-8 border-white/10" />

        {loading && (
          <p className="text-center text-sm text-slate-400">Memuat…</p>
        )}

        {!loading && empty && (
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-[#f5e6c8]">
              <span className="text-5xl" aria-hidden>
                📱
              </span>
            </div>
            <h2 className="text-xl font-black text-amber-400">
              Tidak ada data invoice
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
              {error ||
                "Username atau email yang dimasukkan belum memiliki riwayat transaksi, harap masukkan email & username dengan tepat"}
            </p>
          </div>
        )}

        {!loading && !empty && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => (
              <section
                key={order.id}
                className="rounded-2xl border border-white/10 bg-[#151a24] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-400">Username</p>
                    <p className="font-bold">@{order.username}</p>
                  </div>
                  <span className="rounded-lg bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-300">
                    {labels[order.status] || order.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-400">Jumlah</p>
                    <p className="font-bold">
                      {order.robuxAmount.toLocaleString("id-ID")} Robux
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Total</p>
                    <p className="font-bold text-emerald-300">
                      {money(order.totalPrice)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 break-all text-xs text-slate-500">
                  ID: {order.id}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(order.createdAt).toLocaleString("id-ID")}
                </p>
                {order.paidAt && (
                  <p className="mt-1 text-xs text-slate-500">
                    Dibayar: {new Date(order.paidAt).toLocaleString("id-ID")}
                  </p>
                )}
                {order.completedAt && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selesai:{" "}
                    {new Date(order.completedAt).toLocaleString("id-ID")}
                  </p>
                )}
              </section>
            ))}
          </div>
        )}

        {!loading && initialDone && !empty && orders.length === 0 && !error && (
          <p className="text-center text-sm text-slate-500">
            Masukkan username Roblox atau email, lalu klik <strong>cek</strong>.
          </p>
        )}
      </div>
    </main>
  );
}
