import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { apiFetch } from "../lib/api";
import {
  ArrowLeft, Lock, Loader2, Check, LogOut, User, Mail, Phone,
  Star, ShieldCheck, Crown, ChevronRight, AlertCircle
} from "lucide-react";

export default function Settings() {
  const { user, isAuthenticated, loading: authLoading, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  // ── Change Password ─────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // ── Change Email ────────────────────────────────────────────────────────
  const [emailStep, setEmailStep] = useState("idle"); // idle | pending | done
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // ── Backup Contact ──────────────────────────────────────────────────────
  const [backupContact, setBackupContact] = useState("");
  const [backupError, setBackupError] = useState("");
  const [backupSuccess, setBackupSuccess] = useState("");
  const [savingBackup, setSavingBackup] = useState(false);

  // ── Premium ─────────────────────────────────────────────────────────────
  const [premiumError, setPremiumError] = useState("");
  const [premiumSuccess, setPremiumSuccess] = useState("");
  const [requestingPremium, setRequestingPremium] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) setBackupContact(user.backup_contact || "");
  }, [user]);

  if (authLoading) return null;

  const displayName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.username || user?.email || "User";

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    if (!currentPassword) { setPwError("Current password is required"); return; }
    if (!newPassword || newPassword.length < 6) { setPwError("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setPwError("Passwords don't match"); return; }
    setSavingPw(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setPwSuccess("Password changed successfully!");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setSavingPw(false);
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
      setEmailSuccess(res.message || "Verification code sent to your new email.");
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

  async function handleSaveBackupContact(e) {
    e.preventDefault();
    setBackupError(""); setBackupSuccess("");
    setSavingBackup(true);
    try {
      await apiFetch("/api/auth/update-backup-contact", {
        method: "POST",
        body: JSON.stringify({ backup_contact: backupContact }),
      });
      await refreshUser();
      setBackupSuccess(backupContact ? "Backup contact saved!" : "Backup contact removed.");
    } catch (err) {
      setBackupError(err.message || "Failed to save backup contact");
    } finally {
      setSavingBackup(false);
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

  const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Link to="/profile/me" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Profile
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-8">Settings</h1>

      {/* Account Info */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
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
                <Crown className={`h-4 w-4 ${user.is_verified ? "text-yellow-500" : "text-primary"}`} title={user.is_verified ? "PRaww Reads Official" : "Premium"} />
              )}
            </div>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            {user?.username && <p className="text-xs text-muted-foreground">@{user.username}</p>}
          </div>
        </div>
        <Link
          to="/profile/me"
          className="inline-flex items-center gap-2 text-sm rounded-lg border border-border px-4 py-2 hover:bg-muted transition-colors"
        >
          <User className="h-4 w-4" /> Edit Profile
        </Link>
      </div>

      {/* Premium */}
      {user?.is_premium ? (
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Premium Member</h2>
          </div>
          <p className="text-sm text-muted-foreground">You have an active Premium account with a verified badge on your profile.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Go Premium</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">Get a verified badge on your profile and support PRaww Reads.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            {/* Monthly plan */}
            <div className="border border-border rounded-xl p-4 flex flex-col gap-2 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">Monthly</span>
                <Star className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">R59<span className="text-sm font-normal text-muted-foreground">/month</span></p>
              <p className="text-xs text-muted-foreground">Cancel any time</p>
              <button
                disabled={requestingPremium}
                onClick={() => handleRequestPremium("monthly")}
                className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {requestingPremium ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Subscribe
              </button>
            </div>

            {/* 6-month promo */}
            <div className="border-2 border-primary rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-bl-lg font-medium">PROMO</div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">6 Months</span>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">R29<span className="text-sm font-normal text-muted-foreground">/month</span></p>
              <p className="text-xs text-muted-foreground">R174 billed for 6 months — save R180</p>
              <button
                disabled={requestingPremium}
                onClick={() => handleRequestPremium("semi")}
                className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {requestingPremium ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                Subscribe
              </button>
            </div>
          </div>

          {premiumError && (
            <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{premiumError}</p>
          )}
          {premiumSuccess && (
            <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{premiumSuccess}</p>
          )}
          {!premiumSuccess && !premiumError && (
            <p className="text-xs text-muted-foreground">After clicking Subscribe, we will contact you at <strong>{user?.email}</strong> with payment details.</p>
          )}
        </div>
      )}

      {/* Change Email */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
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
            <p className="text-sm text-muted-foreground">A 6-digit code was sent to <strong>{newEmail}</strong>. Enter it below within 60 seconds to confirm your new email.</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Verification Code</label>
              <input type="text" value={emailCode} onChange={e => setEmailCode(e.target.value)}
                placeholder="123456" maxLength={6}
                className={inputClass + " tracking-widest text-center text-lg font-mono"} />
            </div>
            {emailError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{emailError}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={savingEmail}
                className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirm New Email
              </button>
              <button type="button" onClick={() => { setEmailStep("idle"); setEmailError(""); setEmailSuccess(""); }}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Backup Contact */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Phone className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg">Backup Contact</h2>
          <span className="ml-auto text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Optional</span>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Add a phone number or alternative contact in case you lose access to your email and need a verification code.
        </p>
        <form onSubmit={handleSaveBackupContact} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone Number or Alternate Contact</label>
            <input type="text" value={backupContact} onChange={e => setBackupContact(e.target.value)}
              placeholder="+27 82 000 0000 (optional)"
              className={inputClass} />
          </div>
          {backupError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{backupError}</p>}
          {backupSuccess && <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{backupSuccess}</p>}
          <button type="submit" disabled={savingBackup}
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
            {savingBackup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save Backup Contact
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg">Change Password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Current Password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              placeholder="••••••••" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••" className={inputClass} />
          </div>
          {pwError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{pwError}</p>}
          {pwSuccess && <p className="text-sm text-green-600 flex items-center gap-1.5"><Check className="h-4 w-4" />{pwSuccess}</p>}
          <button type="submit" disabled={savingPw}
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
            {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Update Password
          </button>
        </form>
      </div>

      {/* Account Actions */}
      <div className="bg-card border border-destructive/30 rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4 text-destructive">Account Actions</h2>
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-sm rounded-lg border border-destructive/40 text-destructive px-4 py-2 hover:bg-destructive/5 transition-colors">
          <LogOut className="h-4 w-4" /> Log Out
        </button>
      </div>
    </div>
  );
}
