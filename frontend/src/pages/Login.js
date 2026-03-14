import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { BookOpen, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-12">
      <div className="mb-8 text-center">
        <Link to="/" className="flex items-center justify-center gap-2 mb-2">
          <BookOpen className="h-8 w-8 text-primary" />
          <span className="font-serif text-3xl font-bold text-primary">PRaww Reads</span>
        </Link>
        <p className="text-muted-foreground text-sm">Welcome back. Sign in to continue your journey.</p>
      </div>

      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-bold mb-1">Log In</h1>
        <p className="text-sm text-muted-foreground mb-6">Sign in to your account</p>

        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <input
              data-testid="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password</label>
            <input
              data-testid="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && <p data-testid="login-error" className="text-sm text-destructive">{error}</p>}

          <button
            data-testid="login-submit"
            type="submit"
            disabled={submitting}
            className="w-full h-11 mt-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Log In
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-5">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">Create one free</Link>
        </p>
      </div>
    </div>
  );
}
