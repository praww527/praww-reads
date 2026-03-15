import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { apiFetch } from "../lib/api";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Lock, Loader2, Check, LogOut, User, Mail, Phone,
  Star, ShieldCheck, Crown, ChevronRight, AlertCircle, BadgeCheck, X,
  Wallet, Gift, BookOpen, TrendingUp, ArrowDownToLine, RefreshCw
} from "lucide-react";

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

function CodeInput({ value, onChange, placeholder = "123456" }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder={placeholder}
      maxLength={6}
      className={inputClass + " tracking-widest text-center text-lg font-mono"}
    />
  );
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div className={`glass-card p-4 ${accent ? "!border-primary/40" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className={`font-serif text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function EarningsTab({ user }) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMsg, setWithdrawMsg] = useState("");
  const [withdrawErr, setWithdrawErr] = useState("");

  useEffect(() => {
    fetchWallet();
  }, []);

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
    } catch (err) {
      setWithdrawErr(err.message || "Withdrawal request failed");
    } finally {
      setWithdrawing(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;

  const balance = wallet?.wallet_balance ?? 0;
  const totalEarnings = wallet?.total_earnings ?? 0;
  const totalDonations = wallet?.total_donation_income ?? 0;
  const totalSales = wallet?.total_sales_income ?? 0;
  const minWithdrawal = wallet?.min_withdrawal ?? 100;
  const canWithdraw = balance >= minWithdrawal;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl font-bold">Earnings & Wallet</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Track your donations, story sales, and wallet balance.</p>
        </div>
        <button onClick={fetchWallet} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard icon={<Wallet className="h-5 w-5 text-primary" />} label="Available Balance" value={`R${balance.toFixed(2)}`} accent={canWithdraw} />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-green-500" />} label="Total Earnings" value={`R${totalEarnings.toFixed(2)}`} />
        <StatCard icon={<Gift className="h-5 w-5 text-violet-500" />} label="From Donations" value={`R${totalDonations.toFixed(2)}`} />
        <StatCard icon={<Lock className="h-5 w-5 text-amber-500" />} label="From Story Sales" value={`R${totalSales.toFixed(2)}`} />
      </div>

      {/* Withdrawal */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownToLine className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Request Withdrawal</h3>
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

      {/* Your Stories */}
      {wallet?.stories?.length > 0 && (
        <div className="glass-card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Your Stories</h3>
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
        <div className="glass-card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-5 w-5 text-violet-500" />
            <h3 className="font-semibold text-lg">Recent Donations</h3>
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

      {/* Story Sales */}
      {wallet?.purchases?.length > 0 && (
        <div className="glass-card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-lg">Story Sales</h3>
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
            <h3 className="font-semibold text-lg">Withdrawal History</h3>
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

export default function Settings() {
  const { user, isAuthenticated, loading: authLoading, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "earnings" ? "earnings" : "account");

  // ── Phone ────────────────────────────────────────────────────────────────
  const [phoneStatus, setPhoneStatus] = useState(null);
  const [phoneStep, setPhoneStep] = useState("idle");
  const [newPhone, setNewPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  // ── Change Email ─────────────────────────────────────────────────────────
  const [emailStep, setEmailStep] = useState("idle");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // ── Change Password ──────────────────────────────────────────────────────
  const [pwStep, setPwStep] = useState("idle");
  const [pwCode, setPwCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // ── Premium ──────────────────────────────────────────────────────────────
  const [premiumError, setPremiumError] = useState("");
  const [premiumSuccess, setPremiumSuccess] = useState("");
  const [requestingPremium, setRequestingPremium] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) loadPhoneStatus();
  }, [user]);

  async function loadPhoneStatus() {
    try {
      const s = await apiFetch("/api/auth/phone-status");
      setPhoneStatus(s);
    } catch { setPhoneStatus(null); }
  }

  if (authLoading) return null;

  const displayName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.username || user?.email || "User";

  async function handleRequestPhoneCode(e) {
    e.preventDefault();
    setPhoneError(""); setPhoneSuccess("");
    if (!newPhone.trim()) { setPhoneError("Enter a phone number"); return; }
    setSavingPhone(true);
    try {
      const res = await apiFetch("/api/auth/request-phone-verify", {
        method: "POST",
        body: JSON.stringify({ phone: newPhone }),
      });
      setPhoneStep("pending");
      setPhoneSuccess(res.message);
    } catch (err) {
      setPhoneError(err.message || "Failed to send code");
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleVerifyPhone(e) {
    e.preventDefault();
    setPhoneError(""); setPhoneSuccess("");
    if (phoneCode.length < 6) { setPhoneError("Enter the full 6-digit code"); return; }
    setSavingPhone(true);
    try {
      const res = await apiFetch("/api/auth/verify-phone", {
        method: "POST",
        body: JSON.stringify({ code: phoneCode }),
      });
      await refreshUser();
      await loadPhoneStatus();
      setPhoneStep("done");
      setPhoneSuccess(res.message);
      setNewPhone(""); setPhoneCode("");
    } catch (err) {
      setPhoneError(err.message || "Invalid or expired code");
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleRequestEmailChange(e) {
    e.preventDefault();
    setEmailError(""); setEmailSuccess("");
    if (!newEmail || !newEmail.includes("@")) { setEmailError("Enter a valid email address"); return; }
    if (!emailPassword) { setEmailError("Current password is required to confirm"); return; }
    setSavingEmail(true);
    try {
      const res = await apiFetch("/api/auth/request-email-change", {
        method: "POST",
        body: JSON.stringify({ new_email: newEmail, current_password: emailPassword }),
      });
      setEmailStep("pending");
      setEmailSuccess(res.message);
    } catch (err) {
      setEmailError(err.message || "Failed to send verification code");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleVerifyEmailChange(e) {
    e.preventDefault();
    setEmailError(""); setEmailSuccess("");
    if (!emailCode.trim()) { setEmailError("Enter the verification code"); return; }
    setSavingEmail(true);
    try {
      const res = await apiFetch("/api/auth/verify-email-change", {
        method: "POST",
        body: JSON.stringify({ code: emailCode }),
      });
      await refreshUser();
      setEmailStep("done");
      setEmailSuccess(res.message || "Email updated successfully!");
      setNewEmail(""); setEmailPassword(""); setEmailCode("");
    } catch (err) {
      setEmailError(err.message || "Invalid or expired code");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleRequestPwCode() {
    setPwError(""); setPwSuccess("");
    setSavingPw(true);
    try {
      const res = await apiFetch("/api/auth/request-password-change-code", { method: "POST" });
      setPwStep("pending");
      setPwSuccess(res.message);
    } catch (err) {
      setPwError(err.message || "Failed to send code");
    } finally {
      setSavingPw(false);
    }
  }

  async function handleVerifyAndChangePw(e) {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    if (pwCode.length < 6) { setPwError("Enter the full 6-digit code"); return; }
    if (!newPassword || newPassword.length < 6) { setPwError("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setPwError("Passwords don't match"); return; }
    setSavingPw(true);
    try {
      const res = await apiFetch("/api/auth/verify-and-change-password", {
        method: "POST",
        body: JSON.stringify({ code: pwCode, new_password: newPassword }),
      });
      setPwStep("done");
      setPwSuccess(res.message);
      setPwCode(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setPwError(err.message || "Invalid or expired code");
    } finally {
      setSavingPw(false);
    }
  }

  async function handleRequestPremium(plan) {
    setPremiumError(""); setPremiumSuccess("");
    setRequestingPremium(true);
    try {
      const res = await apiFetch("/api/auth/request-premium", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      setPremiumSuccess(res.message);
    } catch (err) {
      setPremiumError(err.message || "Failed to submit request");
    } finally {
      setRequestingPremium(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  const tabs = [
    { id: "account", label: "Account" },
    { id: "earnings", label: "Earnings & Wallet", icon: <Wallet className="h-4 w-4" /> },
  ];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Link to="/profile/me" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Profile
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "earnings" ? (
        <EarningsTab user={user} />
      ) : (
        <>
          {/* Account Info */}
          <div className="glass-card p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {user?.profile_image_url ? (
                  <img src={user.profile_image_url} alt={displayName} className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <span className="text-primary font-bold text-xl">{displayName[0]?.toUpperCase() || "?"}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-foreground">{displayName}</p>
                  {(user?.is_premium || user?.is_verified) && (
                    <Crown className={`h-4 w-4 ${user.is_verified ? "text-yellow-500" : "text-primary"}`} />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                {user?.username && <p className="text-xs text-muted-foreground">@{user.username}</p>}
              </div>
            </div>
            <Link to="/profile/me"
              className="inline-flex items-center gap-2 text-sm rounded-lg border border-border px-4 py-2 hover:bg-muted transition-colors">
              <User className="h-4 w-4" /> Edit Profile
            </Link>
          </div>

          {/* Premium */}
          {user?.is_premium ? (
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-2xl p-6 mb-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">Premium Member</h2>
                <BadgeCheck className="h-5 w-5 text-primary ml-1" />
              </div>
              <p className="text-sm text-muted-foreground">You have an active Premium account with a verified badge on your profile.</p>
            </div>
          ) : (
            <div className="glass-card p-6 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">Go Premium</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">Get a verified badge and support PRaww Reads.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="border border-border rounded-xl p-4 flex flex-col gap-2 hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Monthly</span>
                    <Star className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">R59<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                  <p className="text-xs text-muted-foreground">Cancel any time</p>
                  <button disabled={requestingPremium} onClick={() => handleRequestPremium("monthly")}
                    className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                    {requestingPremium ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    Subscribe
                  </button>
                </div>
                <div className="border-2 border-primary rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-bl-lg font-medium">PROMO</div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">6 Months</span>
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">R29<span className="text-sm font-normal text-muted-foreground">/month</span></p>
                  <p className="text-xs text-muted-foreground">R174 billed for 6 months — save R180</p>
                  <button disabled={requestingPremium} onClick={() => handleRequestPremium("semi")}
                    className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                    {requestingPremium ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    Subscribe
                  </button>
                </div>
              </div>
              {premiumError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{premiumError}</p>}
              {premiumSuccess && <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{premiumSuccess}</p>}
              {!premiumSuccess && !premiumError && (
                <p className="text-xs text-muted-foreground">We will contact you at <strong>{user?.email}</strong> with payment details.</p>
              )}
            </div>
          )}

          {/* Phone Number */}
          <div className="glass-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">Phone Number</h2>
              {phoneStatus?.phone_verified && (
                <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                  <Check className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Add a verified phone number for account recovery. You can change it once every {15} days.
              {phoneStatus?.phone && !phoneStatus?.phone_verified && (
                <span className="ml-1 text-amber-600 font-medium">(unverified)</span>
              )}
            </p>

            {phoneStatus?.phone && (
              <p className="text-sm font-medium mb-4 flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {phoneStatus.phone}
                {phoneStatus.phone_verified
                  ? <BadgeCheck className="h-4 w-4 text-green-600" />
                  : <span className="text-xs text-amber-600">(not verified)</span>}
              </p>
            )}

            {!phoneStatus?.can_change && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                You can change your phone number again in <strong>{phoneStatus?.days_left} day(s)</strong>.
              </p>
            )}

            {phoneStep === "done" ? (
              <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{phoneSuccess}</p>
            ) : phoneStep === "idle" ? (
              phoneStatus?.can_change !== false && (
                <form onSubmit={handleRequestPhoneCode} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{phoneStatus?.phone ? "New Phone Number" : "Phone Number"}</label>
                    <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                      placeholder="+27 82 000 0000" className={inputClass} />
                  </div>
                  {phoneError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{phoneError}</p>}
                  <p className="text-xs text-muted-foreground">A verification code will be sent to your email <strong>{user?.email}</strong>.</p>
                  <button type="submit" disabled={savingPhone}
                    className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                    {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                    Send Verification Code
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleVerifyPhone} className="space-y-4">
                {phoneSuccess && <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{phoneSuccess}</p>}
                <p className="text-sm text-muted-foreground">A code was sent to <strong>{user?.email}</strong>. Enter it within 60 seconds to verify <strong>{newPhone}</strong>.</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Verification Code</label>
                  <CodeInput value={phoneCode} onChange={setPhoneCode} />
                </div>
                {phoneError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{phoneError}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={savingPhone || phoneCode.length < 6}
                    className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                    {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Verify Phone
                  </button>
                  <button type="button" onClick={() => { setPhoneStep("idle"); setPhoneError(""); setPhoneSuccess(""); setPhoneCode(""); }}
                    className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Change Email */}
          <div className="glass-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-5">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">Change Email</h2>
            </div>
            {emailStep === "done" ? (
              <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{emailSuccess}</p>
            ) : emailStep === "idle" ? (
              <form onSubmit={handleRequestEmailChange} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New Email Address</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="you@example.com" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Current Password</label>
                  <input type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)}
                    placeholder="Confirm with your password" className={inputClass} />
                </div>
                {emailError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{emailError}</p>}
                <button type="submit" disabled={savingEmail}
                  className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                  {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send Verification Code
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailChange} className="space-y-4">
                {emailSuccess && <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{emailSuccess}</p>}
                <p className="text-sm text-muted-foreground">A code was sent to <strong>{newEmail}</strong>. Enter it within 60 seconds.</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Verification Code</label>
                  <CodeInput value={emailCode} onChange={setEmailCode} />
                </div>
                {emailError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{emailError}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={savingEmail || emailCode.length < 6}
                    className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                    {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirm New Email
                  </button>
                  <button type="button" onClick={() => { setEmailStep("idle"); setEmailError(""); setEmailSuccess(""); setEmailCode(""); }}
                    className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Change Password */}
          <div className="glass-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">Change Password</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              We'll send a verification code to <strong>{user?.email}</strong>
              {phoneStatus?.phone_verified ? <> or your phone <strong>{phoneStatus.phone}</strong></> : null} before changing your password.
            </p>
            {pwStep === "done" ? (
              <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{pwSuccess}</p>
            ) : pwStep === "idle" ? (
              <div className="space-y-3">
                {pwError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{pwError}</p>}
                <button onClick={handleRequestPwCode} disabled={savingPw}
                  className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                  {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send Verification Code
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyAndChangePw} className="space-y-4">
                {pwSuccess && <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{pwSuccess}</p>}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Verification Code</label>
                  <CodeInput value={pwCode} onChange={setPwCode} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Confirm New Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password" className={inputClass} />
                </div>
                {pwError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{pwError}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={savingPw}
                    className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                    {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Change Password
                  </button>
                  <button type="button" onClick={() => { setPwStep("idle"); setPwError(""); setPwSuccess(""); setPwCode(""); }}
                    className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Log Out */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <LogOut className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">Log Out</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Sign out of your account on this device.</p>
            <button onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-destructive/40 text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/5 transition-colors">
              <LogOut className="h-4 w-4" /> Log Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
