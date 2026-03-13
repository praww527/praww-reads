import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  function switchMode(m) {
    setMode(m);
    setError("");
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (!loginEmail) { setError("Email is required"); return; }
    if (!loginPassword) { setError("Password is required"); return; }
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/");
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    if (!regEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) { setError("Enter a valid email"); return; }
    if (!regPassword || regPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (regPassword !== regConfirm) { setError("Passwords don't match"); return; }
    setSubmitting(true);
    try {
      await register(regEmail, regPassword, regFirstName, regLastName);
      navigate("/");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-12">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <BookOpen className="h-8 w-8 text-primary" />
          <span className="font-serif text-3xl font-bold text-primary">PRaww Reads</span>
        </div>
        <p className="text-muted-foreground text-sm">Your journey into a world of stories starts here.</p>
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl">
        <div className="grid grid-cols-2 border-b border-border">
          {["login", "register"].map((m) => (
            <button
              key={m}
              data-testid={`tab-${m}`}
              type="button"
              onClick={() => switchMode(m)}
              className={`py-4 text-sm font-semibold transition-colors ${m === "login" ? "rounded-tl-2xl" : "rounded-tr-2xl"} ${mode === m ? "bg-background text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        <div className="p-6 sm:p-8">
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <p className="text-center text-sm text-muted-foreground mb-4">Sign in to your account</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input data-testid="login-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Password</label>
                <input data-testid="login-password" type="password" placeholder="••••••••" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              {error && <p data-testid="login-error" className="text-sm text-destructive">{error}</p>}
              <button data-testid="login-submit" type="submit" disabled={submitting}
                className="w-full h-11 mt-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Log In
              </button>
              <p className="text-center text-sm text-muted-foreground">Don't have an account?{" "}
                <button type="button" onClick={() => switchMode("register")} className="text-primary font-medium hover:underline">Sign up free</button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <p className="text-center text-sm text-muted-foreground mb-4">Create your free account</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">First Name</label>
                  <input data-testid="register-firstname" type="text" placeholder="First name" value={regFirstName} onChange={e => setRegFirstName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Last Name</label>
                  <input data-testid="register-lastname" type="text" placeholder="Last name" value={regLastName} onChange={e => setRegLastName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input data-testid="register-email" type="email" placeholder="you@example.com" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Password</label>
                <input data-testid="register-password" type="password" placeholder="At least 6 characters" value={regPassword} onChange={e => setRegPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Confirm Password</label>
                <input data-testid="register-confirm-password" type="password" placeholder="••••••••" value={regConfirm} onChange={e => setRegConfirm(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              {error && <p data-testid="register-error" className="text-sm text-destructive">{error}</p>}
              <button data-testid="register-submit" type="submit" disabled={submitting}
                className="w-full h-11 mt-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create Account
              </button>
              <p className="text-center text-sm text-muted-foreground">Already have an account?{" "}
                <button type="button" onClick={() => switchMode("login")} className="text-primary font-medium hover:underline">Log in</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
