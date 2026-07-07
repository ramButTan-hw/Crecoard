"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Step = "login" | "signup" | "verify-email" | "mfa" | "forgot" | "forgot-sent";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CY = new Date().getFullYear();
const YEARS = Array.from({ length: CY - 1899 }, (_, i) => CY - i);
const DAYS  = Array.from({ length: 31 }, (_, i) => i + 1);

function calcStrength(p: string): number {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 16) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 5) as 0 | 1 | 2 | 3 | 4 | 5;
}

const STRENGTH = [
  { label: "", color: "transparent" },
  { label: "Very weak",   color: "#ed4245" },
  { label: "Weak",        color: "#faa61a" },
  { label: "Fair",        color: "#faa61a" },
  { label: "Strong",      color: "#23a55a" },
  { label: "Very strong", color: "#23a55a" },
] as const;

function GIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

type OAuthProvider = "google";

function OAuthButtons({ loading, onProvider }: { loading: boolean; onProvider: (p: OAuthProvider) => void }) {
  return (
    <>
      <div className="auth-divider">
        <div className="auth-divider-line" />
        <span className="auth-divider-text">or</span>
        <div className="auth-divider-line" />
      </div>
      <button type="button" className="auth-btn auth-btn-secondary" onClick={() => onProvider("google")} disabled={loading}>
        <GIcon /> Continue with Google
      </button>
    </>
  );
}

const CSS = `
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface, #1a1b1e);
  padding: 16px;
}
.auth-card {
  width: 100%;
  max-width: 440px;
  background: var(--surface-raised, #25262b);
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.auth-heading {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary, #f2f2f2);
  text-align: center;
  margin: 0 0 8px;
}
.auth-sub {
  font-size: 15px;
  color: #b5bac1;
  text-align: center;
  margin: 0 0 24px;
}
.auth-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #b5bac1;
  margin-bottom: 8px;
}
.auth-label-err { color: #ed4245; }
.auth-label-hint { font-size: 11px; font-weight: 400; text-transform: none; letter-spacing: 0; color: #ed4245; }
.auth-input {
  width: 100%;
  background: var(--surface, #1a1b1e);
  border: 1px solid var(--border, #373a40);
  border-radius: 4px;
  color: var(--text-primary, #f2f2f2);
  font-size: 16px;
  padding: 10px 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
  font-family: inherit;
}
.auth-input:focus { border-color: var(--accent, #d59ee8); }
.auth-input.err { border-color: #ed4245; }
.auth-input::placeholder { color: #4e5058; }
.auth-input-wrap { position: relative; display: flex; align-items: center; }
.auth-input-wrap .auth-input { padding-right: 44px; }
.auth-eye {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  cursor: pointer;
  color: #b5bac1;
  display: flex;
  padding: 0;
  line-height: 1;
}
.auth-eye:hover { color: var(--text-primary, #f2f2f2); }
.auth-select {
  flex: 1;
  background: var(--surface, #1a1b1e);
  border: 1px solid var(--border, #373a40);
  border-radius: 4px;
  color: var(--text-primary, #f2f2f2);
  font-size: 14px;
  padding: 10px 8px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
  font-family: inherit;
  appearance: auto;
}
.auth-select:focus { border-color: var(--accent, #d59ee8); }
.auth-select.err { border-color: #ed4245; }
.auth-btn {
  width: 100%;
  padding: 11px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s, opacity 0.15s;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.auth-btn-primary {
  background: var(--accent, #d59ee8);
  color: #fff;
}
.auth-btn-primary:hover:not(:disabled) { background: var(--accent-hover, #c47fd6); }
.auth-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.auth-btn-secondary {
  background: none;
  border: 1px solid var(--border, #373a40);
  color: var(--text-primary, #f2f2f2);
}
.auth-btn-secondary:hover:not(:disabled) { background: var(--surface-overlay, #2c2d33); }
.auth-btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; }
.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
}
.auth-divider-line { flex: 1; border-top: 1px solid var(--border, #373a40); }
.auth-divider-text { font-size: 13px; color: #b5bac1; }
.auth-link {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  color: var(--accent, #d59ee8);
  text-decoration: none;
}
.auth-link:hover { text-decoration: underline; }
.auth-footer {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: #b5bac1;
  line-height: 1.8;
}
.auth-error {
  font-size: 13px;
  color: #ed4245;
  background: rgba(237,66,69,0.1);
  border: 1px solid rgba(237,66,69,0.3);
  border-radius: 4px;
  padding: 10px 12px;
  margin-bottom: 16px;
}
.auth-field { margin-bottom: 16px; }
.strength-bar { height: 4px; border-radius: 2px; margin-top: 8px; background: var(--border, #373a40); overflow: hidden; }
.strength-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease, background 0.3s ease; }
.strength-label { font-size: 11px; margin-top: 4px; font-weight: 600; }
.otp-row { display: flex; gap: 8px; justify-content: center; margin: 24px 0; }
.otp-box {
  width: 46px;
  height: 58px;
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  background: var(--surface, #1a1b1e);
  border: 2px solid var(--border, #373a40);
  border-radius: 4px;
  color: var(--text-primary, #f2f2f2);
  outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
  caret-color: transparent;
}
.otp-box:focus { border-color: var(--accent, #d59ee8); }
.otp-box.filled { border-color: var(--accent, #d59ee8); }
.auth-checkbox-row { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
.auth-checkbox-row input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent, #d59ee8); cursor: pointer; flex-shrink: 0; }
.auth-checkbox-label { font-size: 14px; color: #b5bac1; }
.auth-icon-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
}
.auth-back {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: #b5bac1;
  font-size: 14px;
  padding: 0;
  margin-bottom: 24px;
  font-family: inherit;
  transition: color 0.15s;
}
.auth-back:hover { color: var(--text-primary, #f2f2f2); }
.auth-req { font-size: 12px; color: #b5bac1; margin-top: 4px; }
.auth-req span { margin-right: 4px; }
.auth-req .ok { color: #23a55a; }
.auth-req .fail { color: #b5bac1; }
`;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]   = useState<Step>("login");
  const [fading, setFading] = useState(false);

  // Shared
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);

  // Sign-up extras
  const [displayName,  setDisplayName]  = useState("");
  const [username,     setUsername]     = useState("");
  const [dobMonth,     setDobMonth]     = useState("");
  const [dobDay,       setDobDay]       = useState("");
  const [dobYear,      setDobYear]      = useState("");
  const [termsAgreed,  setTermsAgreed]  = useState(false);

  // Login extras
  const [rememberMe, setRememberMe] = useState(true);

  // MFA
  const [otp,           setOtp]           = useState<string[]>(Array(6).fill(""));
  const [mfaFactorId,   setMfaFactorId]   = useState("");
  const [mfaChallengeId,setMfaChallengeId]= useState("");
  const [mfaAvatar,     setMfaAvatar]     = useState<string | null>(null);
  const [useBackup,     setUseBackup]     = useState(false);
  const [backupCode,    setBackupCode]    = useState("");

  // UI
  const [error,       setError]       = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading,     setLoading]     = useState(false);
  const [cooldown,    setCooldown]    = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  function goTo(s: Step) {
    setFading(true);
    setError(null);
    setFieldErrors({});
    setTimeout(() => { setStep(s); setFading(false); }, 160);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: ae } = await supabase.auth.signInWithPassword({ email, password });
      if (ae) {
        if (ae.message.includes("Invalid login credentials") || ae.message.includes("invalid_credentials")) {
          setError("Email or password is incorrect.");
        } else if (ae.message.toLowerCase().includes("email not confirmed")) {
          setError("Please verify your email before signing in.");
        } else if (ae.status === 429 || ae.message.includes("rate")) {
          setError("Too many failed attempts. Please wait a few minutes before trying again.");
        } else if (ae.message.toLowerCase().includes("failed to fetch") || ae.message.toLowerCase().includes("network")) {
          setError("Can't reach the server — check your internet connection and try again.");
        } else {
          setError(ae.message);
        }
        return;
      }
      if (data.session) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const tf = factors?.totp?.[0];
          if (tf) {
            const { data: ch } = await supabase.auth.mfa.challenge({ factorId: tf.id });
            setMfaFactorId(tf.id);
            setMfaChallengeId(ch?.id ?? "");
            setMfaAvatar(
              data.user?.user_metadata?.avatar_url ??
              data.user?.user_metadata?.picture ??
              null
            );
            goTo("mfa");
            return;
          }
        }
      }
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email address.";
    if (displayName.trim().length < 1)
      errs.displayName = "Required.";
    if (username.length < 2 || username.length > 32)
      errs.username = "Must be 2–32 characters.";
    else if (!/^[a-z0-9_.]+$/i.test(username))
      errs.username = "Letters, numbers, underscores, and periods only.";
    if (password.length < 8)
      errs.password = "Must be at least 8 characters.";
    if (!dobMonth || !dobDay || !dobYear)
      errs.dob = "Please fill in your date of birth.";
    if (!termsAgreed)
      errs.terms = "You must agree to the Terms of Service.";
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);
    try {
      const { error: ae } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, username },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (ae) {
        if (ae.message.toLowerCase().includes("already registered") || ae.message.includes("User already registered"))
          setError("An account with this email already exists.");
        else if (ae.message.toLowerCase().includes("failed to fetch") || ae.message.toLowerCase().includes("network"))
          setError("Can't reach the server — check your internet connection and try again.");
        else
          setError(ae.message);
        return;
      }
      goTo("verify-email");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa() {
    const code = useBackup ? backupCode : otp.join("");
    if (code.length < 6) return;
    setError(null);
    setLoading(true);
    try {
      const { error: ve } = await supabase.auth.mfa.verify({
        factorId:   mfaFactorId,
        challengeId: mfaChallengeId,
        code,
      });
      if (ve) {
        setError("Invalid code. Please try again.");
        setOtp(Array(6).fill(""));
        otpRefs.current[0]?.focus();
        return;
      }
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: ae } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (ae) { setError(ae.message); return; }
      goTo("forgot-sent");
    } finally {
      setLoading(false);
    }
  }

  // Desktop app: OAuth runs in the SYSTEM browser (Google blocks embedded
  // webviews), and the session comes back via a crecoard:// deep link.
  const [oauthInfo, setOauthInfo] = useState<string | null>(null);

  useEffect(() => {
    const off = window.electron?.onDeepLink?.(async (url) => {
      if (!url.startsWith("crecoard://auth")) return;
      setError(null);
      setLoading(true);
      try {
        // PKCE flow: ?code=...  |  implicit flow: #access_token=...&refresh_token=...
        const code = /[?&]code=([^&#]+)/.exec(url)?.[1];
        if (code) {
          const { error: ex } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(code));
          if (ex) throw ex;
        } else {
          const hash = new URLSearchParams(url.split("#")[1] ?? "");
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (!access_token || !refresh_token) throw new Error("No credentials in sign-in link.");
          const { error: se } = await supabase.auth.setSession({ access_token, refresh_token });
          if (se) throw se;
        }
        window.location.href = "/";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed — try again.");
        setLoading(false);
        setOauthInfo(null);
      }
    });
    return () => { off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setLoading(true);
    const isDesktop = !!window.electron?.openExternal;
    const { data, error: ae } = await supabase.auth.signInWithOAuth({
      provider,
      options: isDesktop
        ? { redirectTo: "crecoard://auth", skipBrowserRedirect: true }
        : { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (ae) { setError(ae.message); setLoading(false); return; }
    if (isDesktop && data?.url) {
      void window.electron!.openExternal(data.url);
      setOauthInfo("Finish signing in with your browser — this window will continue automatically.");
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      await supabase.auth.resend({ type: "signup", email });
      setCooldown(60);
    } finally {
      setLoading(false);
    }
  }

  // ── OTP helpers ────────────────────────────────────────────────────────────
  function handleOtpChange(i: number, val: string) {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every((d) => d) && !useBackup) {
      setOtp(next);
      setTimeout(handleMfa, 0);
    }
  }

  function handleOtpKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (digits.length === 6) {
      const arr = digits.split("");
      setOtp(arr);
      setTimeout(handleMfa, 0);
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const pwStrength  = calcStrength(password);
  const pwMeta      = STRENGTH[pwStrength];
  const pwBarWidth  = `${(pwStrength / 5) * 100}%`;
  const pwHas8      = password.length >= 8;
  const pwHasUpper  = /[A-Z]/.test(password);
  const pwHasNumber = /[0-9]/.test(password);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="auth-page">
        <div
          className="auth-card"
          style={{ opacity: fading ? 0 : 1, transform: fading ? "translateY(8px)" : "none" }}
        >

          {/* ── LOGIN ──────────────────────────────────────────────────────── */}
          {step === "login" && (
            <>
              <h1 className="auth-heading">Welcome back!</h1>
              <p className="auth-sub">We&rsquo;re so excited to see you again!</p>

              {error && <div className="auth-error" role="alert">{error}</div>}

              <form onSubmit={handleLogin} noValidate>
                <div className="auth-field">
                  <div className={`auth-label ${fieldErrors.email ? "auth-label-err" : ""}`}>
                    Email or phone number
                    {fieldErrors.email && <span className="auth-label-hint">— {fieldErrors.email}</span>}
                  </div>
                  <input
                    className={`auth-input ${fieldErrors.email ? "err" : ""}`}
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="auth-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div className={`auth-label`} style={{ margin: 0 }}>Password</div>
                    <button type="button" className="auth-link" style={{ fontSize: 13 }} onClick={() => goTo("forgot")}>
                      Forgot your password?
                    </button>
                  </div>
                  <div className="auth-input-wrap">
                    <input
                      className="auth-input"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" className="auth-eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label className="auth-checkbox-row">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    <span className="auth-checkbox-label">Keep me signed in</span>
                  </label>
                </div>

                <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
                  {loading ? "Signing in…" : "Log In"}
                </button>
              </form>

              <OAuthButtons loading={loading} onProvider={handleOAuth} />
              {oauthInfo && (
                <div role="status" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(213,158,232,0.1)", border: "1px solid rgba(213,158,232,0.35)", color: "#d59ee8", fontSize: 13 }}>
                  {oauthInfo}
                </div>
              )}

              <div className="auth-footer">
                <span>Need an account? </span>
                <button className="auth-link" onClick={() => goTo("signup")}>Register</button>
                <br />
                <button
                  className="auth-link"
                  style={{ color: "#b5bac1", fontSize: 13 }}
                  onClick={() => {
                    // Set a session cookie so the middleware lets guests through
                    document.cookie = "plancraft-guest=true; path=/";
                    window.location.href = "/";
                  }}
                >
                  Continue without account →
                </button>
                <br />
                <a className="auth-link" style={{ color: "#b5bac1", fontSize: 13 }} href="/download">
                  ⬇ Get the desktop app
                </a>
              </div>
            </>
          )}

          {/* ── SIGN UP ────────────────────────────────────────────────────── */}
          {step === "signup" && (
            <>
              <h1 className="auth-heading">Create an account</h1>

              {error && <div className="auth-error" role="alert">{error}</div>}

              <form onSubmit={handleSignup} noValidate>
                <div className="auth-field">
                  <div className={`auth-label ${fieldErrors.email ? "auth-label-err" : ""}`}>
                    Email
                    {fieldErrors.email && <span className="auth-label-hint">— {fieldErrors.email}</span>}
                  </div>
                  <input
                    className={`auth-input ${fieldErrors.email ? "err" : ""}`}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="auth-field">
                  <div className={`auth-label ${fieldErrors.displayName ? "auth-label-err" : ""}`}>
                    Display name
                    {fieldErrors.displayName && <span className="auth-label-hint">— {fieldErrors.displayName}</span>}
                  </div>
                  <input
                    className={`auth-input ${fieldErrors.displayName ? "err" : ""}`}
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="auth-field">
                  <div className={`auth-label ${fieldErrors.username ? "auth-label-err" : ""}`}>
                    Username
                    {fieldErrors.username && <span className="auth-label-hint">— {fieldErrors.username}</span>}
                  </div>
                  <input
                    className={`auth-input ${fieldErrors.username ? "err" : ""}`}
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  />
                </div>

                <div className="auth-field">
                  <div className={`auth-label ${fieldErrors.password ? "auth-label-err" : ""}`}>
                    Password
                    {fieldErrors.password && <span className="auth-label-hint">— {fieldErrors.password}</span>}
                  </div>
                  <div className="auth-input-wrap">
                    <input
                      className={`auth-input ${fieldErrors.password ? "err" : ""}`}
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" className="auth-eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {password && (
                    <>
                      <div className="strength-bar">
                        <div className="strength-fill" style={{ width: pwBarWidth, background: pwMeta.color }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <div style={{ display: "flex", gap: 12 }}>
                          <span style={{ fontSize: 11, color: pwHas8 ? "#23a55a" : "#b5bac1" }}>
                            {pwHas8 ? "✓" : "✗"} 8+ chars
                          </span>
                          <span style={{ fontSize: 11, color: pwHasUpper ? "#23a55a" : "#b5bac1" }}>
                            {pwHasUpper ? "✓" : "✗"} Uppercase
                          </span>
                          <span style={{ fontSize: 11, color: pwHasNumber ? "#23a55a" : "#b5bac1" }}>
                            {pwHasNumber ? "✓" : "✗"} Number
                          </span>
                        </div>
                        <span className="strength-label" style={{ color: pwMeta.color }}>
                          {pwMeta.label}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Date of Birth */}
                <div className="auth-field">
                  <div className={`auth-label ${fieldErrors.dob ? "auth-label-err" : ""}`}>
                    Date of birth
                    {fieldErrors.dob && <span className="auth-label-hint">— {fieldErrors.dob}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      className={`auth-select ${fieldErrors.dob ? "err" : ""}`}
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      style={{ flex: 2 }}
                    >
                      <option value="">Month</option>
                      {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                    </select>
                    <select
                      className={`auth-select ${fieldErrors.dob ? "err" : ""}`}
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                    >
                      <option value="">Day</option>
                      {DAYS.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                    </select>
                    <select
                      className={`auth-select ${fieldErrors.dob ? "err" : ""}`}
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      style={{ flex: 1.5 }}
                    >
                      <option value="">Year</option>
                      {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                    </select>
                  </div>
                  <p className="auth-req" style={{ marginTop: 8 }}>
                    This information is kept private and not shared with others.
                  </p>
                </div>

                {/* Terms */}
                <div className="auth-field">
                  <label className="auth-checkbox-row">
                    <input
                      type="checkbox"
                      checked={termsAgreed}
                      onChange={(e) => setTermsAgreed(e.target.checked)}
                    />
                    <span className={`auth-checkbox-label ${fieldErrors.terms ? "" : ""}`} style={{ color: fieldErrors.terms ? "#ed4245" : "#b5bac1" }}>
                      I agree to Crecoard&rsquo;s{" "}
                      <span style={{ color: "var(--accent, #d59ee8)" }}>Terms of Service</span>
                      {" "}and{" "}
                      <span style={{ color: "var(--accent, #d59ee8)" }}>Privacy Policy</span>.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="auth-btn auth-btn-primary"
                  disabled={loading}
                >
                  {loading ? "Creating account…" : "Continue"}
                </button>
              </form>

              <OAuthButtons loading={loading} onProvider={handleOAuth} />
              {oauthInfo && (
                <div role="status" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(213,158,232,0.1)", border: "1px solid rgba(213,158,232,0.35)", color: "#d59ee8", fontSize: 13 }}>
                  {oauthInfo}
                </div>
              )}

              <div className="auth-footer">
                <span>Already have an account? </span>
                <button className="auth-link" onClick={() => goTo("login")}>Log in</button>
              </div>
            </>
          )}

          {/* ── VERIFY EMAIL ───────────────────────────────────────────────── */}
          {step === "verify-email" && (
            <>
              <div
                className="auth-icon-circle"
                style={{ background: "rgba(88,101,242,0.15)" }}
              >
                <Mail size={32} color="var(--accent, #d59ee8)" />
              </div>
              <h1 className="auth-heading">Verify your email</h1>
              <p className="auth-sub">
                We&rsquo;ve sent a verification link to{" "}
                <strong style={{ color: "var(--text-primary, #f2f2f2)" }}>{email}</strong>.
                Click the link in the email to activate your account.
              </p>

              <p style={{ textAlign: "center", fontSize: 14, color: "#b5bac1", marginBottom: 24 }}>
                Didn&rsquo;t get an email?{" "}
                <button
                  className="auth-link"
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                  style={{ opacity: cooldown > 0 || loading ? 0.5 : 1 }}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                </button>
              </p>

              <button type="button" className="auth-back" onClick={() => goTo("login")}>
                <ArrowLeft size={16} /> Back to login
              </button>
            </>
          )}

          {/* ── MFA ────────────────────────────────────────────────────────── */}
          {step === "mfa" && (
            <>
              {mfaAvatar ? (
                <img
                  src={mfaAvatar}
                  alt="Profile"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    objectFit: "cover",
                    display: "block",
                    margin: "0 auto 20px",
                    border: "3px solid rgba(35,165,90,0.45)",
                  }}
                />
              ) : (
                <div
                  className="auth-icon-circle"
                  style={{ background: "rgba(35,165,90,0.15)" }}
                >
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#23a55a", lineHeight: 1 }}>
                    {email[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>
              )}
              <h1 className="auth-heading">Two-factor authentication</h1>
              <p className="auth-sub">
                {useBackup
                  ? "Enter one of your backup codes to access your account."
                  : "Open your authenticator app and enter the 6-digit code for Crecoard."}
              </p>

              {error && <div className="auth-error" role="alert">{error}</div>}

              {!useBackup ? (
                <>
                  <div className="otp-row" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        className={`otp-box ${digit ? "filled" : ""}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKey(i, e)}
                        autoFocus={i === 0}
                        aria-label={`Code digit ${i + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="auth-btn auth-btn-primary"
                    onClick={handleMfa}
                    disabled={loading || otp.join("").length < 6}
                  >
                    {loading ? "Verifying…" : "Log In"}
                  </button>

                  <p style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: "#b5bac1" }}>
                    Lost your authenticator?{" "}
                    <button className="auth-link" onClick={() => { setUseBackup(true); setError(null); }}>
                      Use a backup code
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <div className="auth-field" style={{ marginTop: 8 }}>
                    <div className="auth-label">Backup code</div>
                    <input
                      className="auth-input"
                      type="text"
                      placeholder="xxxx-xxxx-xxxx-xxxx"
                      value={backupCode}
                      onChange={(e) => setBackupCode(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    className="auth-btn auth-btn-primary"
                    onClick={handleMfa}
                    disabled={loading || backupCode.trim().length < 8}
                    style={{ marginBottom: 12 }}
                  >
                    {loading ? "Verifying…" : "Log In"}
                  </button>
                  <button className="auth-link" style={{ display: "block", textAlign: "center", fontSize: 14 }} onClick={() => { setUseBackup(false); setBackupCode(""); }}>
                    Use authenticator app instead
                  </button>
                </>
              )}

              <div style={{ marginTop: 20 }}>
                <button type="button" className="auth-back" onClick={() => { goTo("login"); setOtp(Array(6).fill("")); setUseBackup(false); }}>
                  <ArrowLeft size={16} /> Back to login
                </button>
              </div>
            </>
          )}

          {/* ── FORGOT PASSWORD ─────────────────────────────────────────────── */}
          {step === "forgot" && (
            <>
              <button type="button" className="auth-back" onClick={() => goTo("login")}>
                <ArrowLeft size={16} /> Back to login
              </button>

              <h1 className="auth-heading">Reset your password</h1>
              <p className="auth-sub">
                Enter your email address and we&rsquo;ll send you a link to reset your password.
              </p>

              {error && <div className="auth-error" role="alert">{error}</div>}

              <form onSubmit={handleForgot} noValidate>
                <div className="auth-field">
                  <div className="auth-label">Email</div>
                  <input
                    className="auth-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                <button type="submit" className="auth-btn auth-btn-primary" disabled={loading || !email.includes("@")}>
                  {loading ? "Sending…" : "Reset Password"}
                </button>
              </form>
            </>
          )}

          {/* ── FORGOT SENT ─────────────────────────────────────────────────── */}
          {step === "forgot-sent" && (
            <>
              <div
                className="auth-icon-circle"
                style={{ background: "rgba(88,101,242,0.15)" }}
              >
                <Mail size={32} color="var(--accent, #d59ee8)" />
              </div>
              <h1 className="auth-heading">Check your email</h1>
              <p className="auth-sub">
                We sent a password reset link to{" "}
                <strong style={{ color: "var(--text-primary, #f2f2f2)" }}>{email}</strong>.
                Follow the link in the email to set a new password.
              </p>
              <p style={{ textAlign: "center", fontSize: 13, color: "#b5bac1", marginBottom: 24 }}>
                Didn&rsquo;t receive it?{" "}
                <button className="auth-link" onClick={() => goTo("forgot")}>Try again</button>
              </p>
              <button type="button" className="auth-back" onClick={() => goTo("login")}>
                <ArrowLeft size={16} /> Back to login
              </button>
            </>
          )}

        </div>
      </div>
    </>
  );
}
