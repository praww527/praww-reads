import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import { Wallet, Gift, BookOpen, TrendingUp, ArrowDownToLine, Loader2, Lock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Earnings() {
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMsg, setWithdrawMsg] = useState("");
  const [withdrawErr, setWithdrawErr] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) fetchWallet();
  }, [isAuthenticated]);

  async function fetchWallet() {
    setLoading(true);
    try {
      const data = await apiFetch("/wallet");
      setWallet(data);
      setWithdrawAmount(data.wallet_balance >= data.min_withdrawal ? data.wallet_balance.toFixed(2) : "");
    } catch {
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw(e) {
    e.preventDefault();
    setWithdrawMsg("");
    setWithdrawErr("");
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < (wallet?.min_withdrawal || 100)) {
      setWithdrawErr(`Minimum withdrawal is R${wallet?.min_withdrawal || 100}`);
      return;
    }
    setWithdrawing(true);
    try {
      const res = await apiFetch("/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setWithdrawMsg(res.message);
      await fetchWallet();
      await refreshUser();
    } catch (err) {
      setWithdrawErr(err.message || "Withdrawal request failed");
    } finally {
      setWithdrawing(false);
    }
  }

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-12 w-12 animate-spin text-primary/50" /></div>;
  if (!isAuthenticated) return null;

  const balance = wallet?.wallet_balance ?? 0;
  const totalEarnings = wallet?.total_earnings ?? 0;
  const totalDonations = wallet?.total_donation_income ?? 0;
  const totalSales = wallet?.total_sales_income ?? 0;
  const minWithdrawal = wallet?.min_withdrawal ?? 100;
  const canWithdraw = balance >= minWithdrawal;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-4xl font-bold">Earnings Dashboard</h1>
          <p className="text-muted-foreground mt-1">Track your donations, story sales, and wallet balance.</p>
        </div>
        <button onClick={fetchWallet} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          icon={<Wallet className="h-5 w-5 text-primary" />}
          label="Available Balance"
          value={`R${balance.toFixed(2)}`}
          accent={canWithdraw}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
          label="Total Earnings"
          value={`R${totalEarnings.toFixed(2)}`}
        />
        <StatCard
          icon={<Gift className="h-5 w-5 text-violet-500" />}
          label="From Donations"
          value={`R${totalDonations.toFixed(2)}`}
        />
        <StatCard
          icon={<Lock className="h-5 w-5 text-amber-500" />}
          label="From Story Sales"
          value={`R${totalSales.toFixed(2)}`}
        />
      </div>

      {/* Withdrawal */}
      <div className="glass-card p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownToLine className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-xl font-bold">Request Withdrawal</h2>
        </div>

        {!canWithdraw ? (
          <div className="rounded-xl bg-muted/50 border border-border p-4 text-sm text-muted-foreground">
            <p>You need a minimum balance of <strong>R{minWithdrawal}</strong> to withdraw.</p>
            <p className="mt-1">Current balance: <strong>R{balance.toFixed(2)}</strong> — you need <strong>R{(minWithdrawal - balance).toFixed(2)}</strong> more.</p>
          </div>
        ) : (
          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount to Withdraw (ZAR)</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">R</span>
                <input
                  type="number"
                  min={minWithdrawal}
                  max={balance}
                  step="0.01"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button type="button" onClick={() => setWithdrawAmount(balance.toFixed(2))}
                  className="text-xs text-primary hover:underline font-medium">Max</button>
              </div>
            </div>

            {withdrawMsg && (
              <div className="rounded-xl bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 text-sm">
                {withdrawMsg}
              </div>
            )}
            {withdrawErr && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm">
                {withdrawErr}
              </div>
            )}

            <p className="text-xs text-muted-foreground">We will contact you at <strong>{user?.email}</strong> with payment details.</p>

            <button type="submit" disabled={withdrawing}
              className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
              {withdrawing && <Loader2 className="h-4 w-4 animate-spin" />}
              {withdrawing ? "Submitting..." : "Request Withdrawal"}
            </button>
          </form>
        )}
      </div>

      {/* Stories */}
      {wallet?.stories?.length > 0 && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl font-bold">Your Stories</h2>
          </div>
          <div className="space-y-3">
            {wallet.stories.map(s => (
              <div key={s.id} className="flex items-center gap-4 rounded-xl border border-border p-3 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <Link to={`/stories/${s.id}`} className="font-medium text-sm hover:text-primary transition-colors truncate block">{s.title}</Link>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {s.is_paid ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Lock className="h-3 w-3" /> R{s.price}</span>
                    ) : (
                      <span>Free</span>
                    )}
                    <span>{s.total_sales || 0} sales</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">R{(s.total_donations || 0).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">donations</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Donations */}
      {wallet?.donations?.length > 0 && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-5 w-5 text-violet-500" />
            <h2 className="font-serif text-xl font-bold">Recent Donations</h2>
          </div>
          <div className="space-y-2">
            {wallet.donations.slice(0, 10).map(d => (
              <div key={d.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <div>
                  <span className="font-medium">Donation received</span>
                  <span className="text-muted-foreground ml-2 text-xs">{d.created_at ? formatDistanceToNow(new Date(d.created_at)) + " ago" : ""}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-600 dark:text-green-400">+R{d.writer_amount?.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">of R{d.amount} total</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sales */}
      {wallet?.purchases?.length > 0 && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-5 w-5 text-amber-500" />
            <h2 className="font-serif text-xl font-bold">Story Sales</h2>
          </div>
          <div className="space-y-2">
            {wallet.purchases.slice(0, 10).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <div>
                  <span className="font-medium">Story purchased</span>
                  <span className="text-muted-foreground ml-2 text-xs">{p.created_at ? formatDistanceToNow(new Date(p.created_at)) + " ago" : ""}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-600 dark:text-green-400">+R{p.writer_amount?.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">of R{p.amount} total</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Withdrawal History */}
      {wallet?.withdrawals?.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDownToLine className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-serif text-xl font-bold">Withdrawal History</h2>
          </div>
          <div className="space-y-2">
            {wallet.withdrawals.map(w => (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <div>
                  <span className="font-medium capitalize">{w.status} withdrawal</span>
                  <span className="text-muted-foreground ml-2 text-xs">{w.created_at ? formatDistanceToNow(new Date(w.created_at)) + " ago" : ""}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold">R{w.amount?.toFixed(2)}</div>
                  <div className={`text-xs capitalize ${w.status === "completed" ? "text-green-500" : w.status === "rejected" ? "text-destructive" : "text-amber-500"}`}>{w.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!wallet?.donations?.length && !wallet?.purchases?.length && !wallet?.stories?.length && (
        <div className="text-center py-16 glass-card" style={{border:"2px dashed rgba(0,0,0,0.10)"}}>
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground mb-2">No earnings yet</p>
          <p className="text-sm text-muted-foreground mb-4">Publish stories and readers can donate or purchase them.</p>
          <Link to="/write" className="inline-flex rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90">Start Writing</Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className={`font-serif text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
