import type {
  ProjectCommunicationEntry,
  ProjectMailLink,
  ProjectMailSettings,
  ProjectSettings,
  SelectedListTarget,
} from '../types';
import { DEFAULT_PROJECT_MAIL_SETTINGS, normalizeProjectSettings } from './projectSettings';

const DEFAULT_WINDOW_DAYS = 40;

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function uniqueMailLinks(links: ProjectMailLink[]) {
  const seen = new Set<string>();
  const result: ProjectMailLink[] = [];

  for (const link of links) {
    if (!link.id || seen.has(link.id)) continue;
    seen.add(link.id);
    result.push(link);
  }

  return result.sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime());
}

function uniqueCommunicationEntries(entries: ProjectCommunicationEntry[]) {
  const seen = new Set<string>();
  const result: ProjectCommunicationEntry[] = [];

  for (const entry of entries) {
    if (!entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }

  return result.sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
}

export function parseCommaSeparatedList(value: string) {
  return uniqueStrings(value.split(','));
}

export function serializeCommaSeparatedList(values: string[]) {
  return values.join(', ');
}

export function normalizeProjectMailSettings(value: Partial<ProjectMailSettings> | null | undefined): Required<ProjectMailSettings> {
  return {
    customerName: typeof value?.customerName === 'string' ? value.customerName.trim() : '',
    customerEmails: uniqueStrings(Array.isArray(value?.customerEmails) ? value.customerEmails.map((item) => String(item)) : []),
    customerKeywords: uniqueStrings(Array.isArray(value?.customerKeywords) ? value.customerKeywords.map((item) => String(item)) : []),
    linkedTaskThreads: uniqueMailLinks(
      Array.isArray(value?.linkedTaskThreads)
        ? value.linkedTaskThreads.map((link) => ({
            id: String(link.id ?? ''),
            taskId: String(link.taskId ?? ''),
            taskName: String(link.taskName ?? ''),
            threadId: String(link.threadId ?? ''),
            subject: String(link.subject ?? ''),
            snippet: String(link.snippet ?? ''),
            fromName: link.fromName ? String(link.fromName) : null,
            fromEmail: link.fromEmail ? String(link.fromEmail) : null,
            latestMessageAt: String(link.latestMessageAt ?? ''),
            gmailUrl: String(link.gmailUrl ?? ''),
            linkedAt: String(link.linkedAt ?? ''),
          }))
        : []
    ),
    communicationLogEntries: uniqueCommunicationEntries(
      Array.isArray(value?.communicationLogEntries)
        ? value.communicationLogEntries.map((entry) => ({
            id: String(entry.id ?? ''),
            occurredAt: String(entry.occurredAt ?? ''),
            subject: String(entry.subject ?? ''),
            summary: String(entry.summary ?? ''),
            fromName: entry.fromName ? String(entry.fromName) : null,
            fromEmail: entry.fromEmail ? String(entry.fromEmail) : null,
            direction:
              entry.direction === 'outgoing' || entry.direction === 'note' ? entry.direction : 'incoming',
            createdAt: String(entry.createdAt ?? ''),
          }))
        : []
    ),
  };
}

export function hasProjectMailConfiguration(settings: ProjectMailSettings | null | undefined) {
  const normalized = normalizeProjectMailSettings(settings);
  return Boolean(
    normalized.customerName ||
      normalized.customerEmails.length > 0 ||
      normalized.customerKeywords.length > 0
  );
}

export function getProjectMailSettings(projectSettings: ProjectSettings | null | undefined) {
  return normalizeProjectMailSettings(normalizeProjectSettings(projectSettings).mailTracking);
}

export function deriveProjectMailKeywords(target: Pick<SelectedListTarget, 'listName'>, settings: ProjectMailSettings | null | undefined) {
  const normalized = normalizeProjectMailSettings(settings);
  const seedKeywords = [
    ...normalized.customerKeywords,
    normalized.customerName,
  ].filter(Boolean);
  return uniqueStrings([
    ...seedKeywords,
    ...(seedKeywords.length > 0 || normalized.customerEmails.length > 0 ? [target.listName] : []),
  ]);
}

function quoteSearchTerm(term: string) {
  const trimmed = term.trim().replace(/"/g, '');
  if (!trimmed) return '';
  return /[\s-]/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

export function buildProjectOutlookSearchQuery(
  target: Pick<SelectedListTarget, 'listName'>,
  settings: ProjectMailSettings | null | undefined
) {
  const normalized = normalizeProjectMailSettings(settings);
  if (!hasProjectMailConfiguration(normalized)) return '';

  const queryGroups: string[] = [];

  if (normalized.customerEmails.length > 0) {
    const emailClauses = normalized.customerEmails.flatMap((email) => [
      `from:${quoteSearchTerm(email)}`,
      `to:${quoteSearchTerm(email)}`,
      `cc:${quoteSearchTerm(email)}`,
    ]);
    queryGroups.push(`(${emailClauses.join(' OR ')})`);
  }

  const keywordTerms = deriveProjectMailKeywords(target, normalized)
    .map(quoteSearchTerm)
    .filter(Boolean);

  if (keywordTerms.length > 0) {
    const keywordClauses = keywordTerms.flatMap((term) => [`subject:${term}`, `body:${term}`]);
    queryGroups.push(`(${keywordClauses.join(' OR ')})`);
  }

  return queryGroups.join(' AND ').trim();
}

export function buildProjectMailQuery(
  target: Pick<SelectedListTarget, 'listName'>,
  settings: ProjectMailSettings | null | undefined,
  options?: { windowDays?: number }
) {
  const normalized = normalizeProjectMailSettings(settings);
  if (!hasProjectMailConfiguration(normalized)) return '';
  const queryParts: string[] = [];

  if (normalized.customerEmails.length > 0) {
    const contactClauses = normalized.customerEmails.map(
      (email) => `(from:${email} OR to:${email} OR cc:${email})`
    );
    queryParts.push(`(${contactClauses.join(' OR ')})`);
  }

  const keywordTerms = deriveProjectMailKeywords(target, normalized)
    .map(quoteSearchTerm)
    .filter(Boolean);

  if (keywordTerms.length > 0) {
    queryParts.push(`(${keywordTerms.join(' OR ')})`);
  }

  const windowDays = options?.windowDays ?? DEFAULT_WINDOW_DAYS;
  if (windowDays > 0) {
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - windowDays);
    queryParts.push(`after:${afterDate.toISOString().slice(0, 10).replace(/-/g, '/')}`);
  }

  return queryParts.join(' ').trim();
}

export function buildProjectMailSearchUrl(
  target: Pick<SelectedListTarget, 'listName'>,
  settings: ProjectMailSettings | null | undefined,
  options?: { windowDays?: number }
) {
  const query = buildProjectMailQuery(target, settings, options);
  return query ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}` : '';
}

export function buildThreadGmailUrl(threadId: string) {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`;
}

export function upsertTaskMailLink(
  projectSettings: ProjectSettings | null | undefined,
  nextLink: ProjectMailLink
) {
  const normalized = normalizeProjectSettings(projectSettings);
  const mailTracking = normalizeProjectMailSettings(normalized.mailTracking);
  const nextLinks = uniqueMailLinks([
    ...mailTracking.linkedTaskThreads.filter((link) => link.id !== nextLink.id),
    nextLink,
  ]);

  return {
    ...normalized,
    mailTracking: {
      ...mailTracking,
      linkedTaskThreads: nextLinks,
    },
  };
}

export function getTaskMailLinks(projectSettings: ProjectSettings | null | undefined, taskId: string) {
  return normalizeProjectMailSettings(projectSettings?.mailTracking ?? DEFAULT_PROJECT_MAIL_SETTINGS).linkedTaskThreads.filter(
    (link) => link.taskId === taskId
  );
}

export function getProjectCommunicationEntries(projectSettings: ProjectSettings | null | undefined) {
  return normalizeProjectMailSettings(projectSettings?.mailTracking ?? DEFAULT_PROJECT_MAIL_SETTINGS).communicationLogEntries;
}

export function upsertProjectCommunicationEntry(
  projectSettings: ProjectSettings | null | undefined,
  nextEntry: ProjectCommunicationEntry
) {
  const normalized = normalizeProjectSettings(projectSettings);
  const mailTracking = normalizeProjectMailSettings(normalized.mailTracking);
  const nextEntries = uniqueCommunicationEntries([
    ...mailTracking.communicationLogEntries.filter((entry) => entry.id !== nextEntry.id),
    nextEntry,
  ]);

  return {
    ...normalized,
    mailTracking: {
      ...mailTracking,
      communicationLogEntries: nextEntries,
    },
  };
}

export function removeProjectCommunicationEntry(
  projectSettings: ProjectSettings | null | undefined,
  entryId: string
) {
  const normalized = normalizeProjectSettings(projectSettings);
  const mailTracking = normalizeProjectMailSettings(normalized.mailTracking);

  return {
    ...normalized,
    mailTracking: {
      ...mailTracking,
      communicationLogEntries: mailTracking.communicationLogEntries.filter((entry) => entry.id !== entryId),
    },
  };
}
