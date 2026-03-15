import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { apiFetch } from "../lib/api";
import { BookOpen, Loader2, Mail, Lock, Check, AlertCircle, ArrowLeft } from "lucide-react";

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

function CodeInput({ value, onChange }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="123456"
      maxLength={6}
      className={inputClass + " tracking-widest text-center text-lg font-mono"}
    />
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Login ────────────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Forgot Password ──────────────────────────────────────────────────────
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState("email"); // email | code | done
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const pre = searchParams.get("email");
    if (pre) setEmail(pre);
  }, [searchParams]);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (!email) { setError("Email is required"); return; }
    if (!password) { setError("Password is required"); return; }
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendResetCode(e) {
    e.preventDefault();
    setForgotError(""); setForgotSuccess("");
    if (!forgotEmail || !forgotEmail.includes("@")) { setForgotError("Enter a valid email address"); return; }
    setForgotLoading(true);
    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSuccess(res.message);
      setForgotStep("code");
    } catch (err) {
      setForgotError(err.message || "Failed to send reset code");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setForgotError("");
    if (forgotCode.length < 6) { setForgotError("Enter the full 6-digit code"); return; }
    if (!newPassword || newPassword.length < 6) { setForgotError("Password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setForgotError("Passwords don't match"); return; }
    setForgotLoading(true);
    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail, code: forgotCode, new_password: newPassword }),
      });
      setForgotSuccess(res.message);
      setForgotStep("done");
    } catch (err) {
      setForgotError(err.message || "Invalid or expired code");
    } finally {
      setForgotLoading(false);
    }
  }

  function resetForgot() {
    setForgotMode(false);
    setForgotStep("email");
    setForgotEmail(""); setForgotCode("");
    setNewPassword(""); setConfirmPassword("");
    setForgotError(""); setForgotSuccess("");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-12">
      <div className="mb-8 text-center">
        <Link to="/" className="flex items-center justify-center gap-2 mb-2">
          <BookOpen className="h-8 w-8 text-primary" />
          <span className="font-serif text-3xl font-bold text-primary">PRaww Reads</span>
        </Link>
        <p className="text-muted-foreground text-sm">
          {forgotMode ? "Reset your password" : "Welcome back. Sign in to continue your journey."}
        </p>
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8">

        {/* ── Forgot Password Flow ── */}
        {forgotMode ? (
          <>
            <button onClick={resetForgot}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-5 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Log In
            </button>

            {forgotStep === "email" && (
              <form onSubmit={handleSendResetCode} className="space-y-4" noValidate>
                <div className="text-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  <h2 className="font-serif text-xl font-bold">Forgot Password</h2>
                  <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send a reset code.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email Address</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com" className={inputClass} autoFocus />
                </div>
                {forgotError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{forgotError}</p>}
                <button type="submit" disabled={forgotLoading}
                  className="w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                  {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send Reset Code
                </button>
              </form>
            )}

            {forgotStep === "code" && (
              <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
                <div className="text-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                  <h2 className="font-serif text-xl font-bold">Set New Password</h2>
                  {forgotSuccess && (
                    <p className="text-sm text-green-600 mt-1 flex items-center justify-center gap-1.5">
                      <Check className="h-4 w-4" />{forgotSuccess}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    Code sent to <strong>{forgotEmail}</strong>. Enter it within 60 seconds.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Verification Code</label>
                  <CodeInput value={forgotCode} onChange={setForgotCode} />
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
                {forgotError && <p className="text-sm text-destructive flex items-center gap-1.5"><AlertCircle className="h-4 w-4" />{forgotError}</p>}
                <button type="submit" disabled={forgotLoading || forgotCode.length < 6}
                  className="w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                  {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Reset Password
                </button>
                <button type="button" onClick={() => { setForgotStep("email"); setForgotCode(""); setForgotError(""); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors">
                  Resend code
                </button>
              </form>
            )}

            {forgotStep === "done" && (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <Check className="h-7 w-7 text-green-600" />
                </div>
                <h2 className="font-serif text-xl font-bold">Password Reset!</h2>
                <p className="text-sm text-muted-foreground">{forgotSuccess}</p>
                <button onClick={resetForgot}
                  className="w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 flex items-center justify-center gap-2">
                  Log In Now
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── Login Form ── */
          <>
            <h1 className="font-serif text-2xl font-bold mb-1">Log In</h1>
            <p className="text-sm text-muted-foreground mb-6">Sign in to your account</p>

            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input data-testid="login-email" type="email" autoComplete="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Password</label>
                  <button type="button" onClick={() => { setForgotMode(true); setForgotEmail(email); }}
                    className="text-xs text-primary hover:underline">
                    Forgot password?
                  </button>
                </div>
                <input data-testid="login-password" type="password" autoComplete="current-password" placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
              </div>

              {error && <p data-testid="login-error" className="text-sm text-destructive">{error}</p>}

              <button data-testid="login-submit" type="submit" disabled={submitting}
                className="w-full h-11 mt-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Log In
              </button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-5">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary font-medium hover:underline">Create one free</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
