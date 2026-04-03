import React from 'react';
import { Download, Loader2, X } from 'lucide-react';
import type { ProjectResource } from '../types';
import { fetchDocxPreview, getResourceDownloadUrl, getResourceViewUrl } from '../api';

interface FilePreviewModalProps {
  resource: ProjectResource;
  onClose: () => void;
}

type PreviewType = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'docx' | 'none';

function getPreviewType(mimeType: string | null, fileName: string | null): PreviewType {
  const name = (fileName ?? '').toLowerCase();
  if (name.endsWith('.docx')) return 'docx';
  if (!mimeType) return 'none';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  ) return 'text';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'none';
}

const DOCX_IFRAME_STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2rem 2.5rem; line-height: 1.7; color: #1e293b; font-size: 14px; }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; margin-top: 1.5em; margin-bottom: 0.4em; line-height: 1.3; }
  h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.1em; }
  p { margin: 0.5em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
  li { margin: 0.25em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #e2e8f0; padding: 0.5em 0.75em; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  strong, b { font-weight: 600; }
  em, i { font-style: italic; }
  a { color: #2563eb; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
`;

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ resource, onClose }) => {
  const viewUrl = getResourceViewUrl(resource.id);
  const downloadUrl = getResourceDownloadUrl(resource.id);
  const previewType = getPreviewType(resource.mime_type, resource.file_name);

  // State for text and docx (both fetched)
  const [fetchedContent, setFetchedContent] = React.useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (previewType === 'text') {
      setFetchLoading(true);
      fetch(viewUrl, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(setFetchedContent)
        .catch(() => setFetchError('Could not load file content.'))
        .finally(() => setFetchLoading(false));
    } else if (previewType === 'docx') {
      setFetchLoading(true);
      fetchDocxPreview(resource.id)
        .then((data) => setFetchedContent(data.html))
        .catch(() => setFetchError('Could not convert document. The file may be corrupted.'))
        .finally(() => setFetchLoading(false));
    }
  }, [resource.id, viewUrl, previewType]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const docxSrcDoc = fetchedContent
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${DOCX_IFRAME_STYLE}</style></head><body>${fetchedContent}</body></html>`
    : '';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="flex w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.18)]" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {resource.file_name ?? resource.label}
          </p>
          <a
            href={downloadUrl}
            download
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <Download size={12} />
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preview area */}
        <div className="min-h-0 flex-1 overflow-auto">
          {previewType === 'image' && (
            <div className="flex items-center justify-center p-6">
              <img
                src={viewUrl}
                alt={resource.file_name ?? resource.label}
                className="max-h-[70vh] max-w-full rounded-lg object-contain"
              />
            </div>
          )}

          {previewType === 'pdf' && (
            <iframe
              src={viewUrl}
              title={resource.file_name ?? resource.label}
              className="h-[75vh] w-full rounded-b-2xl border-0"
            />
          )}

          {previewType === 'video' && (
            <div className="flex items-center justify-center bg-black p-4">
              <video src={viewUrl} controls className="max-h-[70vh] max-w-full rounded-lg" />
            </div>
          )}

          {previewType === 'audio' && (
            <div className="flex items-center justify-center p-10">
              <audio src={viewUrl} controls className="w-full max-w-md" />
            </div>
          )}

          {(previewType === 'text' || previewType === 'docx') && (
            <div className={previewType === 'text' ? 'p-4' : ''}>
              {fetchLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              )}
              {fetchError && (
                <p className="py-10 text-center text-sm text-red-500">{fetchError}</p>
              )}
              {fetchedContent !== null && !fetchLoading && previewType === 'text' && (
                <pre className="overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-700" style={{ maxHeight: '70vh' }}>
                  {fetchedContent}
                </pre>
              )}
              {fetchedContent !== null && !fetchLoading && previewType === 'docx' && (
                <iframe
                  srcDoc={docxSrcDoc}
                  title={resource.file_name ?? resource.label}
                  className="h-[75vh] w-full rounded-b-2xl border-0"
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          )}

          {previewType === 'none' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
              <p className="text-sm">Preview is not available for this file type.</p>
              <a
                href={downloadUrl}
                download
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Download size={13} />
                Download to open
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
