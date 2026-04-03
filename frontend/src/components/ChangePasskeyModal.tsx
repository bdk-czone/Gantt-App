import React from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';

interface ChangePasskeyModalProps {
  open: boolean;
  onClose: () => void;
}

const API_URL = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');

const ChangePasskeyModal: React.FC<ChangePasskeyModalProps> = ({ open, onClose }) => {
  const [currentPasskey, setCurrentPasskey] = React.useState('');
  const [newPasskey, setNewPasskey] = React.useState('');
  const [confirmPasskey, setConfirmPasskey] = React.useState('');
  const [showPasskeys, setShowPasskeys] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setCurrentPasskey('');
    setNewPasskey('');
    setConfirmPasskey('');
    setError(null);
    setSuccess(false);
    setSubmitting(false);
    setShowPasskeys(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasskey !== confirmPasskey) {
      setError('New passkeys do not match');
      return;
    }
    if (newPasskey.length < 4) {
      setError('New passkey must be at least 4 characters');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/change-passkey`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPasskey, newPasskey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to change passkey');
      }
      setSuccess(true);
      setCurrentPasskey('');
      setNewPasskey('');
      setConfirmPasskey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change passkey');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <KeyRound size={17} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Change passkey</h2>
              <p className="text-xs text-slate-500">All other sessions will be signed out</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
              Passkey changed successfully.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <input
                type={showPasskeys ? 'text' : 'password'}
                value={currentPasskey}
                onChange={(e) => setCurrentPasskey(e.target.value)}
                placeholder="Current passkey"
                autoFocus
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPasskeys((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPasskeys ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <input
              type={showPasskeys ? 'text' : 'password'}
              value={newPasskey}
              onChange={(e) => setNewPasskey(e.target.value)}
              placeholder="New passkey"
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />

            <input
              type={showPasskeys ? 'text' : 'password'}
              value={confirmPasskey}
              onChange={(e) => setConfirmPasskey(e.target.value)}
              placeholder="Confirm new passkey"
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />

            {error && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !currentPasskey || !newPasskey || !confirmPasskey}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Change'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasskeyModal;
