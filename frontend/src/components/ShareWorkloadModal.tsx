import React from 'react';
import { Check, Copy, ExternalLink, Loader2, Share2, X } from 'lucide-react';

interface ShareWorkloadModalProps {
  open: boolean;
  shareName: string;
  shareUrl: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onCreateLink: () => void;
}

const ShareWorkloadModal: React.FC<ShareWorkloadModalProps> = ({
  open,
  shareName,
  shareUrl,
  loading,
  error,
  onClose,
  onCreateLink,
}) => {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open, shareUrl]);

  if (!open) return null;

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Share Workload</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{shareName}</h2>
            <p className="mt-2 text-sm text-slate-500">
              This link is read-only and auto-refreshes so someone else can follow your live progress without editing anything.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
          {shareUrl ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Shared link</p>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 break-all">
                {shareUrl}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Generate a secure link for the currently selected workload.</p>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCreateLink}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
            {shareUrl ? 'Generate new link' : 'Create link'}
          </button>
          <button
            type="button"
            onClick={() => {
              void copyLink();
            }}
            disabled={!shareUrl || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (shareUrl) {
                window.open(shareUrl, '_blank', 'noopener,noreferrer');
              }
            }}
            disabled={!shareUrl || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ExternalLink size={16} />
            Open shared view
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareWorkloadModal;
