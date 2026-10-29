"use client";

import { useEffect, useState } from "react";

type Config = {
  stock: number;
  pricePerRobux: number;
  currency: string;
};

type RobloxUser = {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
};

const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default function Home() {
  const [config, setConfig] = useState<Config | null>(null);
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("100");
  const [user, setUser] = useState<RobloxUser | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem("robux_status_token");
      if (t && t.length >= 40) setStatusBanner(t);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const r = await fetch("/api/config", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (active) setConfig(data);
      } catch {
        if (active) setMessage("Stok belum dapat dimuat dari server.");
      }
    };

    void load();
    const timer = setInterval(load, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const quantity = Number(amount);
  const valid =
    Number.isSafeInteger(quantity) &&
    quantity >= 10 &&
    quantity <= (config?.stock ?? 0);

  const total =
    config && valid ? quantity * config.pricePerRobux : 0;

  async function checkout() {
    if (!user || !config || !valid || checkoutLoading) return;

    setCheckoutLoading(true);
    setMessage("");

    try {
      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          robuxAmount: quantity,
        }),
      });

      const orderData = await orderResponse.json();
      if (!orderResponse.ok) {
        throw new Error(orderData.error || "Gagal membuat pesanan.");
      }

      const orderId = orderData.order?.id || orderData.orderId || orderData.id;
      if (!orderId) {
        throw new Error("Pesanan dibuat, tetapi ID pesanan tidak ditemukan. Periksa respons API sebelum mencoba lagi.");
      }

      const statusToken = orderData.statusToken as string | undefined;
      if (typeof statusToken === "string" && statusToken.length >= 40) {
        try {
          sessionStorage.setItem("robux_status_token", statusToken);
          sessionStorage.setItem("robux_status_order", String(orderId));
        } catch {
          // ignore
        }
      }

      const paymentResponse = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      const paymentData = await paymentResponse.json();
      if (!paymentResponse.ok) {
        throw new Error(paymentData.error || "Gagal membuat checkout pembayaran.");
      }

      const checkoutUrl = paymentData.checkoutUrl || paymentData.checkout_url;
      if (typeof checkoutUrl !== "string" || !checkoutUrl) {
        throw new Error("Tautan checkout tidak ditemukan.");
      }

      window.location.href = checkoutUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout gagal.");
    } finally {
      setCheckoutLoading(false);
    }
  }

async function checkUser() {
    setLoading(true);
    setUser(null);
    setMessage("");

    try {
      const r = await fetch("/api/roblox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Username tidak ditemukan.");

      setUser(data);
      setMessage("Username ditemukan. Periksa akun tujuan.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090b12] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 font-black">R</div>
            <div>
              <p className="font-bold">ROBUX STORE</p>
              <p className="text-xs text-slate-400">Top up praktis</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/status-pesanan" className="text-xs font-bold text-violet-300">
              Cek status
            </a>
            <span className="text-xs text-emerald-300">● Toko online</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-12">
        {statusBanner && (
          <div className="mb-6 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-sm">
            <p className="font-bold text-violet-200">Ada pesanan yang bisa dilacak</p>
            <p className="mt-1 text-slate-300">
              Setelah bayar di Kasera, buka halaman status untuk melihat progres.
            </p>
            <a
              href={`/status-pesanan#token=${statusBanner}`}
              className="mt-3 inline-block rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold"
            >
              Lihat status pesanan
            </a>
          </div>
        )}
        <p className="mb-3 text-sm font-bold tracking-[.2em] text-violet-400">
          ROBLOX TOP UP
        </p>
        <h1 className="text-4xl font-black leading-tight md:text-6xl">
          Robux untuk
          <span className="block text-violet-400">petualanganmu.</span>
        </h1>
        <p className="mt-4 max-w-xl text-slate-400">
          Masukkan username Roblox, pilih jumlah, dan periksa estimasi harga.
        </p>

        <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-white/10 bg-[#111521] p-5 md:p-8">
            <h2 className="text-xl font-bold">Buat pesanan</h2>

            <label className="mb-2 mt-6 block text-sm">Username Roblox</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUser(null);
                }}
                placeholder="Username Roblox"
                maxLength={20}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#090d17] px-4 py-3 outline-none focus:border-violet-500"
              />
              <button
                onClick={checkUser}
                disabled={loading || username.trim().length < 3}
                className="rounded-xl bg-white/10 px-5 py-3 font-bold disabled:opacity-40"
              >
                {loading ? "Memeriksa..." : "Periksa"}
              </button>
            </div>

            {user && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/20 p-3">
                {user.avatar && (
                  <img src={user.avatar} alt="Avatar Roblox" className="h-12 w-12 rounded-lg" />
                )}
                <div>
                  <p className="font-bold">{user.displayName}</p>
                  <p className="text-sm text-slate-400">@{user.username}</p>
                </div>
              </div>
            )}

            <label className="mb-2 mt-7 block text-sm">Jumlah Robux</label>
            <input
              type="number"
              min={10}
              max={config?.stock ?? 0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#090d17] px-4 py-4 text-lg font-bold outline-none focus:border-violet-500"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {[100, 250, 500, 1000].map((n) => (
                <button
                  key={n}
                  disabled={!config || n > config.stock}
                  onClick={() => setAmount(String(n))}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm disabled:opacity-30"
                >
                  {n.toLocaleString("id-ID")}
                </button>
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-violet-400/20 bg-violet-400/5 p-5">
              <div className="flex justify-between gap-3 text-sm text-slate-400">
                <span>Harga per Robux</span>
                <span className="text-white">
                  {config ? money(config.pricePerRobux) : "Memuat..."}
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="text-sm text-slate-400">Estimasi total</span>
                <span className="text-2xl font-black text-violet-300">
                  {config ? money(total) : "—"}
                </span>
              </div>
            </div>

            {message && <p role="status" className="mt-4 text-sm text-slate-300">{message}</p>}

            <button
              disabled={!config || config.stock <= 0 || !valid || !user || checkoutLoading}
              onClick={checkout}
              className="mt-5 w-full rounded-xl bg-violet-600 px-5 py-4 font-bold disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {checkoutLoading ? "Menyiapkan pembayaran..." : !config ? "Memuat toko..." : config.stock <= 0 ? "Stok habis" : "Lanjut ke pembayaran"}
            </button>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-[#111521] p-6">
            <p className="text-sm text-slate-400">Sisa limit Robux</p>
            <p className="mt-3 text-4xl font-black">
              {config ? config.stock.toLocaleString("id-ID") : "—"}
            </p>
            <p className="mt-1 text-sm text-slate-400">Robux tersedia</p>
            {config?.stock === 0 && (
              <p className="mt-4 text-sm font-bold text-red-300">Stok habis</p>
            )}
            <hr className="my-6 border-white/10" />
            <h3 className="font-bold">Cara pembelian</h3>
            <ol className="mt-4 space-y-4 text-sm text-slate-400">
              <li>01 — Periksa username Roblox.</li>
              <li>02 — Tentukan jumlah Robux.</li>
              <li>03 — Periksa estimasi harga.</li>
            </ol>
            <p className="mt-6 text-xs leading-5 text-slate-500">
              Jangan pernah memberikan password Roblox kepada toko.
              Jangan bagikan password Roblox. Simpan tautan status pesanan Anda.
            </p>
          </aside>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-7 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Robux Store
      </footer>
    </main>
  );
}
