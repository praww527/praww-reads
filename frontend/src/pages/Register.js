import { useState, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, Loader2, Mail, RefreshCw } from "lucide-react";

export default function RegisterPage() {
  const { register, verifyEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [verifyStep, setVerifyStep] = useState(false);
  const [verifyEmail_, setVerifyEmail_] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const codeRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email"); return; }
    if (!password || password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setSubmitting(true);
    try {
      const result = await register(email, password, firstName, lastName);
      if (result?.token) {
        navigate("/");
        return;
      }
      setVerifyEmail_(email);
      setVerifyStep(true);
      setShowLoginPrompt(false);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => codeRefs[0].current?.focus(), 100);
    } catch (err) {
      const msg = err.message || "Registration failed";
      if (err.status === 409 || msg.toLowerCase().includes("already exists")) {
        setLoginEmail(email);
        setShowLoginPrompt(true);
        setError("");
      } else {
        setShowLoginPrompt(false);
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setSubmitting(true);
    try {
      await register(verifyEmail_, password, firstName, lastName);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => codeRefs[0].current?.focus(), 100);
    } catch (err) {
      const msg = err.message || "Could not resend code";
      if (err.status === 409 || msg.toLowerCase().includes("already exists")) {
        setVerifyStep(false);
        setLoginEmail(verifyEmail_);
        setShowLoginPrompt(true);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCodeInput(idx, val) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) codeRefs[idx + 1].current?.focus();
  }

  function handleCodeKeyDown(idx, e) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) codeRefs[idx - 1].current?.focus();
    if (e.key === "ArrowLeft" && idx > 0) codeRefs[idx - 1].current?.focus();
    if (e.key === "ArrowRight" && idx < 5) codeRefs[idx + 1].current?.focus();
  }

  function handleCodePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...code];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    codeRefs[Math.min(pasted.length, 5)].current?.focus();
  }

  async function handleVerify(e) {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length < 6) { setError("Please enter the full 6-digit code"); return; }
    setError("");
    setSubmitting(true);
    try {
      await verifyEmail(verifyEmail_, fullCode);
      navigate("/");
    } catch (err) {
      const msg = err.message || "Verification failed";
      if (err.status === 409 || msg.toLowerCase().includes("already exists")) {
        setVerifyStep(false);
        setLoginEmail(verifyEmail_);
        setShowLoginPrompt(true);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-12">
      <div className="mb-8 text-center">
        <Link to="/" className="flex items-center justify-center gap-2 mb-2">
          <BookOpen className="h-8 w-8 text-primary" />
          <span className="font-serif text-3xl font-bold text-primary">PRaww Reads</span>
        </Link>
        <p className="text-muted-foreground text-sm">Join a world of stories — create your free account.</p>
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8">
        {verifyStep ? (
          <form onSubmit={handleVerify} className="space-y-5" noValidate>
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-7 w-7 text-primary" />
                </div>
              </div>
              <h2 className="font-serif text-xl font-bold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit code to <span className="font-medium text-foreground">{verifyEmail_}</span>.
                It expires in 60 seconds.
              </p>
            </div>

            <div className="flex justify-center gap-2">
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={codeRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleCodeInput(idx, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(idx, e)}
                  onPaste={idx === 0 ? handleCodePaste : undefined}
                  className="w-11 h-14 text-center text-xl font-bold rounded-lg border-2 border-input bg-background focus:outline-none focus:border-primary transition-colors"
                />
              ))}
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <button type="submit" disabled={submitting || code.join("").length < 6}
              className="w-full h-11 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify & Create Account
            </button>

            <div className="flex items-center justify-center gap-4 text-sm">
              <button type="button" onClick={handleResend} disabled={submitting}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" /> Resend code
              </button>
              <span className="text-border">|</span>
              <button type="button" onClick={() => { setVerifyStep(false); setError(""); }}
                className="text-muted-foreground hover:text-primary transition-colors">
                Change email
              </button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-bold mb-1">Create Account</h1>
            <p className="text-sm text-muted-foreground mb-6">Fill in your details to get started</p>

            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">First Name</label>
                  <input data-testid="register-firstname" type="text" autoComplete="given-name" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Last Name</label>
                  <input data-testid="register-lastname" type="text" autoComplete="family-name" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input data-testid="register-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Password</label>
                <input data-testid="register-password" type="password" autoComplete="new-password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Confirm Password</label>
                <input data-testid="register-confirm-password" type="password" autoComplete="new-password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {showLoginPrompt && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm space-y-2">
                  <p className="font-medium text-amber-900">An account with this email already exists.</p>
                  <p className="text-amber-700">Would you like to log in instead?</p>
                  <Link
                    to={`/login?email=${encodeURIComponent(loginEmail)}`}
                    className="block w-full text-center h-9 leading-9 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 text-sm"
                  >
                    Log in with this email
                  </Link>
                </div>
              )}

              {error && <p data-testid="register-error" className="text-sm text-destructive">{error}</p>}

              {!showLoginPrompt && (
                <button data-testid="register-submit" type="submit" disabled={submitting}
                  className="w-full h-11 mt-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create Account
                </button>
              )}

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
