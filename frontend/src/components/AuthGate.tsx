import React from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

type AuthState = 'loading' | 'needs_setup' | 'needs_login' | 'authenticated';

interface AuthGateProps {
  children: (onLogout: () => Promise<void>) => React.ReactNode;
}

const API_URL = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, { credentials: 'include', ...options });
}

async function fetchAuthStatus(): Promise<{ authenticated: boolean; needsSetup: boolean }> {
  const res = await apiFetch('/api/auth/status');
  if (!res.ok) throw new Error('Failed to check auth status');
  return res.json() as Promise<{ authenticated: boolean; needsSetup: boolean }>;
}

async function apiSetup(passkey: string): Promise<void> {
  const res = await apiFetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passkey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Setup failed');
  }
}

async function apiLogin(passkey: string): Promise<void> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passkey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Incorrect passkey');
  }
}

async function apiLogout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [authState, setAuthState] = React.useState<AuthState>('loading');
  const [passkey, setPasskey] = React.useState('');
  const [confirmPasskey, setConfirmPasskey] = React.useState('');
  const [showPasskey, setShowPasskey] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    fetchAuthStatus()
      .then(({ authenticated, needsSetup }) => {
        if (authenticated) setAuthState('authenticated');
        else if (needsSetup) setAuthState('needs_setup');
        else setAuthState('needs_login');
      })
      .catch(() => setAuthState('needs_login'));
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passkey !== confirmPasskey) {
      setError('Passkeys do not match');
      return;
    }
    if (passkey.length < 4) {
      setError('Passkey must be at least 4 characters');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiSetup(passkey);
      setPasskey('');
      setConfirmPasskey('');
      setAuthState('authenticated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiLogin(passkey);
      setPasskey('');
      setAuthState('authenticated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect passkey');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await apiLogout().catch(() => {});
    setPasskey('');
    setConfirmPasskey('');
    setError(null);
    setAuthState('needs_login');
  };

  if (authState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (authState === 'authenticated') {
    return <>{children(handleLogout)}</>;
  }

  const isSetup = authState === 'needs_setup';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)]">
      <div className="w-full max-w-sm px-4">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="mb-7 flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
              <Lock size={22} className="text-blue-600" />
            </div>
            <div className="text-center">
              <div className="flex flex-col leading-none">
                <span
                  className="text-[1.45rem] font-black tracking-[-0.055em] text-[#5C73F4]"
                  style={{ fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif' }}
                >
                  cloudzone
                </span>
                <span
                  className="mt-0.5 self-end text-[0.42rem] tracking-[-0.01em] text-slate-800"
                  style={{ fontFamily: '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif' }}
                >
                  <span className="font-semibold italic">a matrix</span> company
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">MyProPlanner</p>
              <p className="mt-1 text-xs text-slate-500">
                {isSetup
                  ? 'First time setup — create a passkey to secure your planner'
                  : 'Enter your passkey to continue'}
              </p>
            </div>
          </div>

          <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-3">
            <div className="relative">
              <input
                type={showPasskey ? 'text' : 'password'}
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                placeholder={isSetup ? 'Create passkey' : 'Passkey'}
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPasskey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPasskey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {isSetup && (
              <input
                type={showPasskey ? 'text' : 'password'}
                value={confirmPasskey}
                onChange={(e) => setConfirmPasskey(e.target.value)}
                placeholder="Confirm passkey"
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            )}

            {error && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || passkey.length === 0}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Please wait…' : isSetup ? 'Create passkey & enter' : 'Unlock'}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Local deployment · Your data stays on your machine</p>
      </div>
    </div>
  );
};

export default AuthGate;
