import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { apiFetch } from "../lib/api";
import { ArrowLeft, Lock, Loader2, Check, LogOut, User } from "lucide-react";

export default function Settings() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  if (!authLoading && !isAuthenticated) {
    navigate("/login");
    return null;
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
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
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setSavingPw(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  const displayName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.username || user?.email || "User";

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
            <p className="font-semibold text-foreground">{displayName}</p>
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

      {/* Change Password */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-lg">Change Password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {pwError && <p className="text-sm text-destructive">{pwError}</p>}
          {pwSuccess && (
            <p className="text-sm text-green-600 flex items-center gap-1.5">
              <Check className="h-4 w-4" /> {pwSuccess}
            </p>
          )}
          <button
            type="submit"
            disabled={savingPw}
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Update Password
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="bg-card border border-destructive/30 rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4 text-destructive">Account Actions</h2>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm rounded-lg border border-destructive/40 text-destructive px-4 py-2 hover:bg-destructive/5 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Log Out
        </button>
      </div>
    </div>
  );
}
