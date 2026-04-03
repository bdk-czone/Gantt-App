import React from 'react';
import { Eye, ExternalLink, File, FolderOpen, Link, Loader2, Trash2, Upload, X } from 'lucide-react';
import type { ProjectResource } from '../types';
import {
  addLinkResource,
  deleteResource,
  getResourceDownloadUrl,
  getResources,
  uploadFileResource,
} from '../api';
import FilePreviewModal from './FilePreviewModal';

interface ResourcesPanelProps {
  listId: string;
  listName: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ResourcesPanel: React.FC<ResourcesPanelProps> = ({ listId, listName, onClose }) => {
  const [resources, setResources] = React.useState<ProjectResource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<'link' | 'file'>('link');

  // Link form
  const [linkLabel, setLinkLabel] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkSaving, setLinkSaving] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  // File upload
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [previewResource, setPreviewResource] = React.useState<ProjectResource | null>(null);

  React.useEffect(() => {
    setLoading(true);
    getResources(listId)
      .then(setResources)
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  }, [listId]);

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = linkLabel.trim();
    let url = linkUrl.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    setLinkSaving(true);
    setLinkError(null);
    try {
      const resource = await addLinkResource(listId, label, url);
      setResources((prev) => [...prev, resource]);
      setLinkLabel('');
      setLinkUrl('');
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to save link');
    } finally {
      setLinkSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadError(null);
    try {
      const resource = await uploadFileResource(listId, file);
      setResources((prev) => [...prev, resource]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (resource: ProjectResource) => {
    if (!confirm(`Remove "${resource.label}"?`)) return;
    setDeletingId(resource.id);
    try {
      await deleteResource(resource.id);
      setResources((prev) => prev.filter((r) => r.id !== resource.id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  const links = resources.filter((r) => r.type === 'link');
  const files = resources.filter((r) => r.type === 'file');

  return (
    <>
    {previewResource && (
      <FilePreviewModal
        resource={previewResource}
        onClose={() => setPreviewResource(null)}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
            <FolderOpen size={17} className="text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-900">Project Resources</h2>
            <p className="truncate text-xs text-slate-500">{listName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 px-6">
          <button
            type="button"
            onClick={() => setTab('link')}
            className={`flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-xs font-medium transition-colors ${
              tab === 'link'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Link size={12} />
            Links{links.length > 0 && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{links.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => setTab('file')}
            className={`ml-4 flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-xs font-medium transition-colors ${
              tab === 'file'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <File size={12} />
            Files{files.length > 0 && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{files.length}</span>}
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : tab === 'link' ? (
            <div className="space-y-4">
              {/* Add link form */}
              <form onSubmit={handleAddLink} className="space-y-2">
                <input
                  type="text"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="Label (e.g. Design Doc)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="submit"
                    disabled={linkSaving || !linkLabel.trim() || !linkUrl.trim()}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {linkSaving ? <Loader2 size={13} className="animate-spin" /> : 'Add'}
                  </button>
                </div>
                {linkError && <p className="text-xs text-red-600">{linkError}</p>}
              </form>

              {/* Link list */}
              {links.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">No links yet. Add one above.</p>
              ) : (
                <ul className="space-y-1.5">
                  {links.map((r) => (
                    <li key={r.id} className="group flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <Link size={13} className="flex-shrink-0 text-blue-400" />
                      <a
                        href={r.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 hover:text-blue-700 hover:underline"
                      >
                        {r.label}
                      </a>
                      <a
                        href={r.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-slate-400 hover:text-blue-600"
                        title={r.url ?? ''}
                      >
                        <ExternalLink size={12} />
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="flex-shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-100 hover:text-red-600"
                        title="Remove"
                      >
                        {deletingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Upload button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs font-medium text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload size={14} /> Click to upload a file (max 50 MB)</>
                  )}
                </button>
                {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
              </div>

              {/* File list */}
              {files.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">No files yet. Upload one above.</p>
              ) : (
                <ul className="space-y-1.5">
                  {files.map((r) => (
                    <li key={r.id} className="group flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <File size={13} className="flex-shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-800">{r.label}</p>
                        {r.file_size != null && (
                          <p className="text-[10px] text-slate-400">{formatBytes(r.file_size)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewResource(r)}
                        className="flex-shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-colors group-hover:opacity-100 hover:text-blue-600"
                        title="Preview"
                      >
                        <Eye size={12} />
                      </button>
                      <a
                        href={getResourceDownloadUrl(r.id)}
                        className="flex-shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-colors group-hover:opacity-100 hover:text-blue-600"
                        title="Download"
                        download
                      >
                        <ExternalLink size={12} />
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="flex-shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-colors group-hover:opacity-100 hover:bg-red-100 hover:text-red-600"
                        title="Remove"
                      >
                        {deletingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default ResourcesPanel;
