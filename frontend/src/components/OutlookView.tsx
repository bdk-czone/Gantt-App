import React from 'react';
import { CalendarClock, ChevronDown, ChevronRight, Mail, Pencil, Plus, Trash2, Type, User } from 'lucide-react';
import {
  extractCommunicationScreenshotText,
  generateCommunicationAIDraft,
  getCommunicationAIStatus,
  updateList,
  type CommunicationAIStatus,
} from '../api';
import {
  getProjectCommunicationEntries,
  getProjectMailSettings,
  removeProjectCommunicationEntry,
  upsertProjectCommunicationEntry,
} from '../lib/mailSettings';
import { parseCommunicationEmail } from '../lib/communicationLogParser';
import { normalizeProjectSettings } from '../lib/projectSettings';
import cloudzoneBackground from '../assets/cloudzone-background.jpg';
import type {
  ProjectCommunicationDirection,
  ProjectCommunicationEntry,
  ProjectSettings,
  SelectedListTarget,
} from '../types';

const UI_SCALE_OPTIONS = [0.9, 1, 1.1, 1.25];
const UI_SCALE_LABELS: Record<number, string> = { 0.9: 'Small', 1: 'Normal', 1.1: 'Large', 1.25: 'XL' };

type ViewMode = 'list' | 'gantt' | 'outlook';

interface OutlookViewProps {
  selectedLists: SelectedListTarget[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  mailNotificationCount: number;
  uiScale: number;
  onUiScaleChange: (scale: number) => void;
}

interface CommunicationDraft {
  occurredAt: string;
  direction: ProjectCommunicationDirection;
  fromName: string;
  fromEmail: string;
  subject: string;
  summary: string;
}

interface SectionData {
  target: SelectedListTarget;
  projectSettings: ProjectSettings;
  customerName: string;
  referenceEmails: string[];
  referenceKeywords: string[];
  entries: ProjectCommunicationEntry[];
}

const directionMeta: Record<ProjectCommunicationDirection, { label: string; className: string }> = {
  incoming: {
    label: 'In',
    className: 'bg-emerald-50 text-emerald-700',
  },
  outgoing: {
    label: 'Out',
    className: 'bg-blue-50 text-blue-700',
  },
  note: {
    label: 'Manual',
    className: 'bg-amber-50 text-amber-700',
  },
};

function getCurrentLocalDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toLocalDateTimeValue(value: string | null | undefined) {
  if (!value) return getCurrentLocalDateTimeValue();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return getCurrentLocalDateTimeValue();
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatOccurredAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function createDraft(entry?: ProjectCommunicationEntry): CommunicationDraft {
  return {
    occurredAt: toLocalDateTimeValue(entry?.occurredAt),
    direction: entry?.direction ?? 'incoming',
    fromName: entry?.fromName ?? '',
    fromEmail: entry?.fromEmail ?? '',
    subject: entry?.subject ?? '',
    summary: entry?.summary ?? '',
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('The pasted screenshot could not be read.'));
    };
    reader.onerror = () => reject(new Error('The pasted screenshot could not be read.'));
    reader.readAsDataURL(file);
  });
}

function generateEntryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const CommunicationSection: React.FC<{
  section: SectionData;
  onSaveSettings: (listId: string, nextSettings: ProjectSettings) => Promise<void>;
  aiStatus: CommunicationAIStatus | null;
}> = ({ section, onSaveSettings, aiStatus }) => {
  const [composerOpen, setComposerOpen] = React.useState(section.entries.length === 0);
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<CommunicationDraft>(() => createDraft());
  const [pastedEmail, setPastedEmail] = React.useState('');
  const [pastedScreenshot, setPastedScreenshot] = React.useState<string | null>(null);
  const [pasteFeedback, setPasteFeedback] = React.useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // 'gemini' = send screenshot to Gemini AI; 'local' = macOS OCR only
  const [screenshotMode, setScreenshotMode] = React.useState<'gemini' | 'local'>('gemini');
  const [ocrFallbackWarning, setOcrFallbackWarning] = React.useState<string | null>(null);
  const sortedEntries = React.useMemo(
    () =>
      [...section.entries].sort(
        (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
      ),
    [section.entries]
  );

  React.useEffect(() => {
    if (!editingEntryId) return;
    const activeEntry = section.entries.find((entry) => entry.id === editingEntryId);
    if (!activeEntry) {
      setEditingEntryId(null);
      setDraft(createDraft());
    }
  }, [editingEntryId, section.entries]);

  const resetComposer = React.useCallback(() => {
    setDraft(createDraft());
    setEditingEntryId(null);
    setPastedEmail('');
    setPastedScreenshot(null);
    setPasteFeedback(null);
    setOcrFallbackWarning(null);
    setComposerOpen(section.entries.length === 0);
    setError(null);
  }, [section.entries.length]);

  const clearComposer = React.useCallback(() => {
    setDraft(createDraft());
    setEditingEntryId(null);
    setPastedEmail('');
    setPastedScreenshot(null);
    setPasteFeedback(null);
    setOcrFallbackWarning(null);
    setComposerOpen(false);
    setError(null);
  }, []);

  const applyDraftValues = React.useCallback((nextValues: Partial<CommunicationDraft>) => {
    setDraft((current) => ({
      occurredAt: nextValues.occurredAt ?? current.occurredAt,
      direction: nextValues.direction ?? current.direction,
      fromName: nextValues.fromName ?? current.fromName,
      fromEmail: nextValues.fromEmail ?? current.fromEmail,
      subject: nextValues.subject ?? current.subject,
      summary: nextValues.summary ?? current.summary,
    }));
  }, []);

  const handlePasteAutofill = () => {
    if (!pastedEmail.trim()) {
      setError('Paste an email or thread first.');
      setPasteFeedback(null);
      return;
    }

    const parsed = parseCommunicationEmail(pastedEmail, {
      referenceEmails: section.referenceEmails,
    });

    if (!parsed) {
      setError('I could not detect enough email details. You can still fill the fields manually.');
      setPasteFeedback(null);
      return;
    }

    applyDraftValues({
      occurredAt: parsed.occurredAt ? toLocalDateTimeValue(parsed.occurredAt) : undefined,
      direction: parsed.direction,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      subject: parsed.subject,
      summary: parsed.summary,
    });
    setError(null);
    setPasteFeedback('Filled the form from the pasted email. You can edit anything before saving.');
  };

  const handleAITextAssist = async () => {
    if (!pastedEmail.trim()) {
      setError('Paste an email or thread first.');
      setPasteFeedback(null);
      return;
    }

    setAnalysisLoading(true);
    setError(null);

    try {
      const aiDraft = await generateCommunicationAIDraft({
        projectName: section.target.listName,
        customerName: section.customerName,
        referenceEmails: section.referenceEmails,
        referenceKeywords: section.referenceKeywords,
        rawText: pastedEmail,
      });

      applyDraftValues({
        occurredAt: aiDraft.occurredAt ? toLocalDateTimeValue(aiDraft.occurredAt) : undefined,
        direction: aiDraft.direction === 'unknown' ? undefined : aiDraft.direction,
        fromName: aiDraft.fromName || undefined,
        fromEmail: aiDraft.fromEmail || undefined,
        subject: aiDraft.subject || undefined,
        summary: aiDraft.summary || undefined,
      });
      setPasteFeedback('AI drafted the log entry fields from your pasted email. Review and save when ready.');
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : 'AI could not analyze that email.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleScreenshotPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    );
    if (!imageItem) return;

    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) {
      setError('The pasted screenshot could not be read.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPastedScreenshot(dataUrl);
      setPasteFeedback('Screenshot captured in memory. Click Analyze screenshot to fill the entry, then it will be discarded.');
      setError(null);
    } catch (pasteError) {
      setError(pasteError instanceof Error ? pasteError.message : 'The pasted screenshot could not be read.');
    }
  };

  const handleAIScreenshotAssist = async () => {
    if (!pastedScreenshot) {
      setError('Paste a screenshot into the screenshot box first.');
      setPasteFeedback(null);
      return;
    }

    setAnalysisLoading(true);
    setError(null);
    setOcrFallbackWarning(null);

    try {
      const aiDraft = await generateCommunicationAIDraft({
        projectName: section.target.listName,
        customerName: section.customerName,
        referenceEmails: section.referenceEmails,
        referenceKeywords: section.referenceKeywords,
        imageDataUrl: pastedScreenshot,
      });

      applyDraftValues({
        occurredAt: aiDraft.occurredAt ? toLocalDateTimeValue(aiDraft.occurredAt) : undefined,
        direction: aiDraft.direction === 'unknown' ? undefined : aiDraft.direction,
        fromName: aiDraft.fromName || undefined,
        fromEmail: aiDraft.fromEmail || undefined,
        subject: aiDraft.subject || undefined,
        summary: aiDraft.summary || undefined,
      });
      setPastedScreenshot(null);
      setPasteFeedback('Gemini analyzed the screenshot and prefilled the entry. Review and save when ready.');
    } catch (aiError) {
      // Show the AI error AND auto-fallback to local OCR
      const geminiMessage = aiError instanceof Error ? aiError.message : 'Gemini could not analyze that screenshot.';
      setOcrFallbackWarning(`Gemini failed (${geminiMessage}) — running local OCR as fallback…`);

      try {
        const extractedText = await extractCommunicationScreenshotText(pastedScreenshot);
        if (!extractedText.trim()) {
          setError('Both Gemini and local OCR could not read that screenshot.');
          setOcrFallbackWarning(null);
          return;
        }
        setPastedEmail(extractedText);
        const parsed = parseCommunicationEmail(extractedText, { referenceEmails: section.referenceEmails });
        if (parsed) {
          applyDraftValues({
            occurredAt: parsed.occurredAt ? toLocalDateTimeValue(parsed.occurredAt) : undefined,
            direction: parsed.direction,
            fromName: parsed.fromName,
            fromEmail: parsed.fromEmail,
            subject: parsed.subject,
            summary: parsed.summary,
          });
          setPasteFeedback('Local OCR fallback filled the form. Gemini was unavailable — check the warning above.');
        } else {
          setPasteFeedback('Local OCR extracted the text. Fill any missing fields manually.');
        }
        setPastedScreenshot(null);
        setOcrFallbackWarning(`Gemini was unavailable (${geminiMessage}). The entry was prefilled using local OCR instead.`);
      } catch (ocrError) {
        setError(`Both Gemini and local OCR failed. Gemini: ${geminiMessage}. OCR: ${ocrError instanceof Error ? ocrError.message : 'unknown error'}`);
        setOcrFallbackWarning(null);
      }
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleLocalScreenshotAssist = async () => {
    if (!pastedScreenshot) {
      setError('Paste a screenshot into the screenshot box first.');
      setPasteFeedback(null);
      return;
    }

    setAnalysisLoading(true);
    setError(null);

    try {
      const extractedText = await extractCommunicationScreenshotText(pastedScreenshot);
      if (!extractedText.trim()) {
        setError('Local OCR could not find readable text in that screenshot.');
        setPasteFeedback(null);
        return;
      }

      setPastedEmail(extractedText);
      const parsed = parseCommunicationEmail(extractedText, {
        referenceEmails: section.referenceEmails,
      });

      if (parsed) {
        applyDraftValues({
          occurredAt: parsed.occurredAt ? toLocalDateTimeValue(parsed.occurredAt) : undefined,
          direction: parsed.direction,
          fromName: parsed.fromName,
          fromEmail: parsed.fromEmail,
          subject: parsed.subject,
          summary: parsed.summary,
        });
        setPasteFeedback('Screenshot read locally and the form was prefilled. The extracted text was also copied into the email box for reference.');
      } else {
        setPasteFeedback('Screenshot text was extracted locally. Review the pasted email text and complete any missing fields.');
      }

      setPastedScreenshot(null);
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : 'Local OCR could not analyze that screenshot.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!draft.subject.trim() || !draft.summary.trim()) {
      setError('Subject and summary are required.');
      return;
    }

    const occurredAt = new Date(draft.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      setError('Please choose a valid date and time.');
      return;
    }

    setSaving(true);
    setError(null);

    const existingEntry = section.entries.find((entry) => entry.id === editingEntryId);
    const nextEntry: ProjectCommunicationEntry = {
      id: editingEntryId ?? generateEntryId(),
      occurredAt: occurredAt.toISOString(),
      direction: draft.direction,
      fromName: draft.fromName.trim() || null,
      fromEmail: draft.fromEmail.trim() || null,
      subject: draft.subject.trim(),
      summary: draft.summary.trim(),
      createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
    };

    try {
      await onSaveSettings(
        section.target.listId,
        upsertProjectCommunicationEntry(section.projectSettings, nextEntry)
      );
      resetComposer();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save the communication entry.');
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  const handleEdit = (entry: ProjectCommunicationEntry) => {
    setComposerOpen(true);
    setEditingEntryId(entry.id);
    setDraft(createDraft(entry));
    setError(null);
  };

  const handleDelete = async (entryId: string) => {
    const confirmed = window.confirm('Delete this communication entry?');
    if (!confirmed) return;

    setSaving(true);
    setError(null);

    try {
      await onSaveSettings(
        section.target.listId,
        removeProjectCommunicationEntry(section.projectSettings, entryId)
      );
      if (editingEntryId === entryId) {
        resetComposer();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete the communication entry.');
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  return (
    <section className="border-b border-dashed border-slate-300 pb-8 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[1.45rem] font-semibold text-slate-950 underline decoration-slate-300 decoration-2 underline-offset-4">
            {section.target.listName}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {section.customerName || 'No customer name saved yet'}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            {section.target.workspaceName} / {section.target.spaceName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {sortedEntries.length} entr{sortedEntries.length === 1 ? 'y' : 'ies'}
          </span>
          <button
            type="button"
            onClick={() => {
              if (composerOpen) {
                clearComposer();
                return;
              }
              setComposerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={14} />
            {composerOpen ? 'Hide form' : 'Add log entry'}
          </button>
        </div>
      </div>

      {(section.referenceEmails.length > 0 || section.referenceKeywords.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reference Emails</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {section.referenceEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                >
                  <Mail size={11} />
                  {email}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Case Keywords</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {section.referenceKeywords.map((keyword) => (
                <span key={keyword} className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {composerOpen && (
        <form onSubmit={handleSubmit} className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {editingEntryId ? 'Edit communication entry' : 'Add communication entry'}
              </h4>
              <p className="text-xs text-slate-500">
                Capture the key subject and summary so the case flow stays clear.
              </p>
            </div>

            {editingEntryId && (
              <button
                type="button"
                onClick={resetComposer}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel edit
              </button>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Date & time</label>
              <input
                type="datetime-local"
                value={draft.occurredAt}
                onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Type</label>
              <select
                value={draft.direction}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    direction: event.target.value as ProjectCommunicationDirection,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500"
              >
                <option value="incoming">Incoming email</option>
                <option value="outgoing">Outgoing email</option>
                <option value="note">Manual note</option>
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-slate-200 bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h5 className="text-sm font-semibold text-slate-900">Paste email to prefill</h5>
                <p className="text-xs leading-5 text-slate-500">
                  Paste copied email text or a thread here. The parsing happens locally in the browser and never leaves your machine.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteAutofill}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Fill from pasted email
                </button>
                <button
                  type="button"
                  onClick={() => void handleAITextAssist()}
                  disabled={!aiStatus?.configured || analysisLoading}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  title={aiStatus?.configured ? `Improve wording with ${aiStatus.provider === 'gemini' ? 'Gemini' : 'AI'}` : 'Add GEMINI_API_KEY to backend/.env to enable'}
                >
                  {analysisLoading ? 'Working…' : aiStatus?.provider === 'gemini' ? 'Gemini wording help' : 'AI wording help'}
                </button>
                {pastedEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      setPastedEmail('');
                      setPasteFeedback(null);
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Clear pasted text
                  </button>
                )}
              </div>
            </div>

            {!aiStatus?.configured && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Gemini wording help is off. Add <code className="rounded bg-amber-100 px-1 font-mono text-xs">GEMINI_API_KEY</code> to <code className="rounded bg-amber-100 px-1 font-mono text-xs">backend/.env</code> and restart the server to enable it. Local text parsing still works.
              </p>
            )}

            {pasteFeedback && (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {pasteFeedback}
              </p>
            )}

            <textarea
              value={pastedEmail}
              onChange={(event) => setPastedEmail(event.target.value)}
              rows={8}
              placeholder={'From: Julia <julia@lengow.com>\nSent: 31 March 2026 10:42\nSubject: Re: Lengow feed issue\n\nPaste the email body here...'}
              className="mt-3 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-slate-200 bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h5 className="text-sm font-semibold text-slate-900">Paste screenshot to read the email</h5>
                <p className="text-xs leading-5 text-slate-500">
                  Click the box, paste a screenshot with <kbd className="rounded border border-slate-200 bg-slate-100 px-1 text-[10px]">Cmd+V</kbd>, and the image will be discarded after analysis.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Mode toggle — only shown when AI is configured */}
                {aiStatus?.configured && (
                  <div className="flex rounded-full border border-slate-200 bg-slate-100 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setScreenshotMode('gemini')}
                      className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                        screenshotMode === 'gemini'
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Gemini AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setScreenshotMode('local')}
                      className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                        screenshotMode === 'local'
                          ? 'bg-white text-slate-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Local OCR
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void (
                    aiStatus?.configured && screenshotMode === 'gemini'
                      ? handleAIScreenshotAssist()
                      : handleLocalScreenshotAssist()
                  )}
                  disabled={analysisLoading || !pastedScreenshot}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {analysisLoading
                    ? 'Analyzing…'
                    : aiStatus?.configured && screenshotMode === 'gemini'
                      ? 'Analyze with Gemini'
                      : 'Analyze screenshot locally'}
                </button>
                {pastedScreenshot && (
                  <button
                    type="button"
                    onClick={() => setPastedScreenshot(null)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Discard screenshot
                  </button>
                )}
              </div>
            </div>

            {/* Info banners */}
            {!aiStatus?.configured && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                No API key configured. The screenshot will be read locally on this Mac using OCR, then discarded.
              </p>
            )}
            {aiStatus?.configured && screenshotMode === 'gemini' && (
              <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Gemini will analyze the screenshot directly for best accuracy. If Gemini fails, local OCR runs automatically as fallback.
              </p>
            )}
            {aiStatus?.configured && screenshotMode === 'local' && (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Local OCR only — screenshot never leaves your Mac. Switch to Gemini AI for better accuracy.
              </p>
            )}
            {ocrFallbackWarning && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠ {ocrFallbackWarning}
              </p>
            )}

            <div
              tabIndex={0}
              onPaste={(event) => void handleScreenshotPaste(event)}
              className="mt-3 rounded-[1rem] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-sm text-slate-500 outline-none transition-colors focus:border-blue-400 focus:bg-blue-50/40"
            >
              {pastedScreenshot ? (
                <div className="space-y-3">
                  <img
                    src={pastedScreenshot}
                    alt="Pasted email screenshot preview"
                    className="max-h-64 rounded-xl border border-slate-200 object-contain shadow-sm"
                  />
                  <p className="text-xs text-slate-500">
                    This screenshot is kept only in memory until you analyze it or discard it.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-slate-700">Click here and paste your email screenshot</p>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPG, WEBP, or GIF screenshots are supported.</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">From / with</label>
              <input
                value={draft.fromName}
                onChange={(event) => setDraft((current) => ({ ...current, fromName: event.target.value }))}
                placeholder={section.customerName || 'Julia from Lengow'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email address</label>
              <input
                value={draft.fromEmail}
                onChange={(event) => setDraft((current) => ({ ...current, fromEmail: event.target.value }))}
                placeholder="contact@customer.com"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Subject</label>
            <input
              value={draft.subject}
              onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Re: Lengow feed issue"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Summary</label>
            <textarea
              value={draft.summary}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
              rows={4}
              placeholder="Summarize the main point, decision, blocker, or next step from the email…"
              className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              required
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <Pencil size={14} />
              {saving ? 'Saving...' : editingEntryId ? 'Save changes' : 'Save entry'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5">
        {sortedEntries.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm leading-6 text-slate-600">
            No communication entries yet. Add the important emails and case updates here to build the project history.
          </div>
        ) : (
          <ul className="space-y-5 pl-5">
            {sortedEntries.map((entry) => {
              const direction = directionMeta[entry.direction];
              return (
                <li key={entry.id} className="list-disc marker:text-slate-400">
                  <article className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock size={13} />
                            {formatOccurredAt(entry.occurredAt)}
                          </span>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${direction.className}`}>
                            {direction.label}
                          </span>
                        </div>

                        <h4 className="mt-2 text-base font-semibold text-slate-950">{entry.subject}</h4>

                        {(entry.fromName || entry.fromEmail) && (
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <User size={12} />
                              {entry.fromName || entry.fromEmail}
                            </span>
                            {entry.fromName && entry.fromEmail && (
                              <span className="inline-flex items-center gap-1">
                                <Mail size={12} />
                                {entry.fromEmail}
                              </span>
                            )}
                          </div>
                        )}

                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{entry.summary}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(entry)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

// ── Communication Log Tree View ────────────────────────────────────────────────

const CommunicationLogTree: React.FC<{
  sections: SectionData[];
  onSaveSettings: (listId: string, settings: ProjectSettings) => Promise<void>;
  aiStatus: CommunicationAIStatus | null;
}> = ({ sections, onSaveSettings, aiStatus }) => {
  // Group sections by workspace → space
  const grouped = React.useMemo(() => {
    const wsMap = new Map<string, { wsName: string; spaces: Map<string, { spaceName: string; sections: SectionData[] }> }>();
    for (const s of sections) {
      if (!wsMap.has(s.target.workspaceId)) {
        wsMap.set(s.target.workspaceId, { wsName: s.target.workspaceName, spaces: new Map() });
      }
      const ws = wsMap.get(s.target.workspaceId)!;
      if (!ws.spaces.has(s.target.spaceId)) {
        ws.spaces.set(s.target.spaceId, { spaceName: s.target.spaceName, sections: [] });
      }
      ws.spaces.get(s.target.spaceId)!.sections.push(s);
    }
    return wsMap;
  }, [sections]);

  const [collapsedWs, setCollapsedWs] = React.useState<Set<string>>(new Set());
  const [collapsedSpaces, setCollapsedSpaces] = React.useState<Set<string>>(new Set());
  const [collapsedProjects, setCollapsedProjects] = React.useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setFn((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        {Array.from(grouped.entries()).map(([wsId, { wsName, spaces }]) => {
          const wsCollapsed = collapsedWs.has(wsId);
          const wsTotalEntries = Array.from(spaces.values()).reduce(
            (n, sp) => n + sp.sections.reduce((m, s) => m + s.entries.length, 0), 0
          );
          return (
            <div key={wsId} className="border-b border-slate-100 last:border-b-0">
              {/* Workspace row */}
              <button
                type="button"
                onClick={() => toggle(collapsedWs, setCollapsedWs, wsId)}
                className="flex w-full items-center gap-2.5 bg-slate-50/60 px-5 py-3 text-left transition-colors hover:bg-slate-100/60"
              >
                <span className="text-slate-400">
                  {wsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
                <span className="flex-1 text-[13px] font-semibold text-slate-800">{wsName}</span>
                <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {wsTotalEntries} entr{wsTotalEntries !== 1 ? 'ies' : 'y'}
                </span>
              </button>

              {!wsCollapsed && Array.from(spaces.entries()).map(([spaceId, { spaceName, sections: spaceSections }]) => {
                const spaceCollapsed = collapsedSpaces.has(spaceId);
                const spaceTotalEntries = spaceSections.reduce((n, s) => n + s.entries.length, 0);
                return (
                  <div key={spaceId}>
                    {/* Space row */}
                    <button
                      type="button"
                      onClick={() => toggle(collapsedSpaces, setCollapsedSpaces, spaceId)}
                      className="flex w-full items-center gap-2.5 px-5 py-2.5 pl-10 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="text-slate-300">
                        {spaceCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </span>
                      <span className="flex-1 text-[12px] font-medium text-slate-500 uppercase tracking-wider">{spaceName}</span>
                      <span className="text-[10px] text-slate-400">{spaceTotalEntries}</span>
                    </button>

                    {!spaceCollapsed && spaceSections.map((section) => {
                      const projCollapsed = collapsedProjects.has(section.target.listId);
                      const sorted = [...section.entries].sort(
                        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
                      );
                      return (
                        <div key={section.target.listId} className="border-t border-slate-50">
                          {/* Project row */}
                          <button
                            type="button"
                            onClick={() => toggle(collapsedProjects, setCollapsedProjects, section.target.listId)}
                            className="flex w-full items-center gap-2.5 py-2.5 pl-16 pr-5 text-left transition-colors hover:bg-slate-50"
                          >
                            <span className="text-slate-300">
                              {projCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                            </span>
                            <span className="flex-1 truncate text-[12.5px] font-semibold text-slate-700">
                              {section.target.listName}
                            </span>
                            {section.customerName && (
                              <span className="hidden truncate text-[10px] text-slate-400 sm:block max-w-[120px]">
                                {section.customerName}
                              </span>
                            )}
                            <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              section.entries.length > 0
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-slate-100 text-slate-400'
                            }`}>
                              {section.entries.length}
                            </span>
                          </button>

                          {/* Entries */}
                          {!projCollapsed && sorted.length > 0 && (
                            <div className="divide-y divide-slate-50 pb-2">
                              {sorted.map((entry) => {
                                const meta = directionMeta[entry.direction] ?? directionMeta.note;
                                return (
                                  <div
                                    key={entry.id}
                                    className="flex items-start gap-3 py-2 pl-20 pr-5 transition-colors hover:bg-slate-50/60"
                                  >
                                    <span className="mt-0.5 shrink-0 text-[10px] text-slate-400">
                                      {formatOccurredAt(entry.occurredAt)}
                                    </span>
                                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${meta.className}`}>
                                      {meta.label}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[11.5px] font-medium text-slate-700">{entry.subject}</p>
                                      {entry.summary && (
                                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{entry.summary}</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {!projCollapsed && sorted.length === 0 && (
                            <p className="py-2 pl-20 pr-5 text-[11px] text-slate-400">No entries yet.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── OutlookView ────────────────────────────────────────────────────────────────

const OutlookView: React.FC<OutlookViewProps> = ({
  selectedLists,
  viewMode,
  onViewModeChange,
  mailNotificationCount,
  uiScale,
  onUiScaleChange,
}) => {
  const [showTree, setShowTree] = React.useState(false);
  const [displayOpen, setDisplayOpen] = React.useState(false);
  const displayRef = React.useRef<HTMLDivElement>(null);

  // Close display panel on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (displayRef.current && !displayRef.current.contains(e.target as Node)) {
        setDisplayOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [settingsByListId, setSettingsByListId] = React.useState<Record<string, ProjectSettings | null>>({});
  const [aiStatus, setAiStatus] = React.useState<CommunicationAIStatus | null>(null);

  React.useEffect(() => {
    setSettingsByListId(
      Object.fromEntries(selectedLists.map((target) => [target.listId, target.listSettings ?? null]))
    );
  }, [selectedLists]);

  React.useEffect(() => {
    let active = true;

    void getCommunicationAIStatus()
      .then((status) => {
        if (active) setAiStatus(status);
      })
      .catch(() => {
        if (active) {
          setAiStatus({
            configured: false,
            provider: null,
            model: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const sections = React.useMemo<SectionData[]>(
    () =>
      selectedLists.map((target) => {
        const projectSettings = normalizeProjectSettings(settingsByListId[target.listId] ?? target.listSettings);
        const mailSettings = getProjectMailSettings(projectSettings);
        return {
          target,
          projectSettings,
          customerName: mailSettings.customerName,
          referenceEmails: mailSettings.customerEmails,
          referenceKeywords: mailSettings.customerKeywords,
          entries: getProjectCommunicationEntries(projectSettings),
        };
      }),
    [selectedLists, settingsByListId]
  );

  const totalEntries = React.useMemo(
    () => sections.reduce((count, section) => count + section.entries.length, 0),
    [sections]
  );

  const handleSaveSettings = React.useCallback(async (listId: string, nextSettings: ProjectSettings) => {
    const updatedList = await updateList(listId, { settings: nextSettings });
    setSettingsByListId((current) => ({
      ...current,
      [listId]: updatedList.settings,
    }));
    window.dispatchEvent(new Event('myproplanner:project-settings-updated'));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* ── Toolbar ── */}
      <div className="relative overflow-hidden border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[34rem] opacity-[0.56]"
          style={{
            backgroundImage: `url(${cloudzoneBackground})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
            backgroundPosition: 'right center',
            maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/88 to-white/74" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* View mode switcher */}
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {(['list', 'gantt', 'outlook'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onViewModeChange(mode)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                    viewMode === mode ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {mode === 'list' ? 'List' : mode === 'gantt' ? 'Gantt' : 'Outlook'}
                  {mode === 'outlook' && mailNotificationCount > 0 && (
                    <span className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                      viewMode === 'outlook' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                    }`}>
                      {mailNotificationCount > 99 ? '99+' : mailNotificationCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* Tree / Flat toggle */}
              <button
                type="button"
                onClick={() => setShowTree((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  showTree
                    ? 'border-blue-300 bg-blue-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {showTree ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Tree
              </button>

              {/* Display button */}
              <div className="relative" ref={displayRef}>
                <button
                  type="button"
                  onClick={() => setDisplayOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    displayOpen
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Type size={14} />
                  Display
                </button>
                {displayOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-[1rem] border border-slate-200 bg-white p-3 shadow-2xl">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Font scale</p>
                    <div className="grid grid-cols-4 gap-1">
                      {UI_SCALE_OPTIONS.map((scale) => (
                        <button
                          key={scale}
                          type="button"
                          onClick={() => onUiScaleChange(scale)}
                          className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                            uiScale === scale
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {UI_SCALE_LABELS[scale]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <h2 className="text-lg font-semibold text-slate-900">Customer Communication Log</h2>
            <p className="text-sm text-slate-500">
              {showTree
                ? 'Tree view — all projects and entries grouped by workspace and space.'
                : 'Keep one simple, chronological history per project so the case flow stays easy to read.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {showTree ? (
        <CommunicationLogTree sections={sections} onSaveSettings={handleSaveSettings} aiStatus={aiStatus} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-5xl rounded-[1.75rem] border border-slate-200 bg-white px-6 py-6 shadow-sm">
            <div className="mb-6 rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              Add one entry for each important email, decision, or manual note. Each project stays separate and reads newest to oldest.
            </div>
            <div className="space-y-8">
              {sections.map((section) => (
                <CommunicationSection
                  key={section.target.listId}
                  section={section}
                  onSaveSettings={handleSaveSettings}
                  aiStatus={aiStatus}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutlookView;
