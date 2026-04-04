import type { ProjectCommunicationDirection } from '../types';

export interface ParsedCommunicationEntryDraft {
  occurredAt?: string;
  direction?: ProjectCommunicationDirection;
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  summary?: string;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;
const HEADER_KEYS = new Set(['from', 'sent', 'date', 'to', 'cc', 'subject']);
const UI_NOISE_PATTERNS = [
  /^customer communication log$/i,
  /^keep one simple, chronological history per project so the case flow stays easy to read\.?$/i,
  /^paste email to prefill$/i,
  /^paste screenshot to read the email$/i,
  /^click the box, paste a screenshot/i,
  /^analyze screenshot/i,
  /^discard screenshot$/i,
  /^this screenshot is kept only in memory/i,
  /^ai wording help is off on this machine/i,
  /^no api key needed here/i,
  /^filled the form from the pasted email/i,
  /^screenshot read locally/i,
  /^screenshot text was extracted locally/i,
  /^summarize$/i,
  /^you don't often get email from /i,
  /^learn why this is important$/i,
];
const SECTION_START_PATTERNS = [
  /^main points discussed$/i,
  /^m(?:ai|e)n points discussed$/i,
  /^key points$/i,
  /^summary$/i,
  /^issue summary$/i,
];
const SECTION_STOP_PATTERNS = [
  /^next steps?$/i,
  /^attachments?$/i,
  /^regards[,!]?$/i,
  /^best[,!]?$/i,
  /^thanks[,!]?$/i,
  /^thank you[,!]?$/i,
  /^from$/i,
  /^subject$/i,
  /^sent$/i,
  /^date$/i,
  /^to$/i,
  /^cc$/i,
];

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function extractHeaderValue(lines: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map((value) => value.toLowerCase());
  const candidateSet = new Set(normalizedCandidates);
  const orderedCandidates = [...normalizedCandidates].sort((left, right) => right.length - left.length);

  for (const rawLine of lines.slice(0, 40)) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    if (!candidateSet.has(key)) continue;

    const value = line.slice(separatorIndex + 1).trim();
    if (value) return value;
  }

  for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
    const line = normalizeToken(lines[index]);
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    if (candidateSet.has(lowerLine)) {
      const nextValue = findNextMeaningfulLine(lines, index + 1);
      if (nextValue) return nextValue;
    }

    for (const candidate of orderedCandidates) {
      if (!lowerLine.startsWith(candidate)) continue;

      const remainder = normalizeToken(line.slice(candidate.length).replace(/^[:/\s-]+/, ''));
      if (!remainder) {
        const nextValue = findNextMeaningfulLine(lines, index + 1);
        if (nextValue) return nextValue;
        continue;
      }

      if (isHeaderLabelLine(remainder) || isUiNoiseLine(remainder)) {
        const nextValue = findNextMeaningfulLine(lines, index + 1);
        if (nextValue) return nextValue;
        continue;
      }

      return remainder;
    }
  }

  return '';
}

function normalizeToken(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractFirstEmail(value: string) {
  const match = value.match(EMAIL_PATTERN);
  return match?.[0] ?? '';
}

function extractAllEmails(value: string) {
  return Array.from(new Set((value.match(EMAIL_PATTERN) ?? []).map((email) => email.toLowerCase())));
}

function extractDisplayName(value: string, email: string) {
  if (!value) return '';

  const angleMatch = value.match(/^(.*?)(?:<[^>]+>)/);
  if (angleMatch?.[1]) {
    return angleMatch[1].replace(/^"+|"+$/g, '').trim();
  }

  if (email) {
    return value.replace(email, '').replace(/[()<>"]/g, '').trim();
  }

  return value.trim();
}

function extractUrls(text: string) {
  return Array.from(new Set((text.match(URL_PATTERN) ?? []).map((value) => value.trim())));
}

function appendUrls(summary: string, text: string) {
  const urls = extractUrls(text);
  if (urls.length === 0) return summary;

  const missingUrls = urls.filter((url) => !summary.includes(url));
  if (missingUrls.length === 0) return summary;
  if (!summary) return missingUrls.join('\n');

  return `${summary}\n${missingUrls.join('\n')}`;
}

function isUiNoiseLine(line: string) {
  return UI_NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

function isHeaderLabelLine(line: string) {
  const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();
  if (HEADER_KEYS.has(normalized) || ['from / with', 'email address'].includes(normalized)) {
    return true;
  }

  return /^(from\s*\/\s*with|email address|subject|date(?:\s*&\s*time)?|type)(\s+(from\s*\/\s*with|email address|subject|date(?:\s*&\s*time)?|type))*$/i.test(
    normalized
  );
}

function isLikelyMetadataLine(line: string) {
  if (isHeaderLabelLine(line) || isUiNoiseLine(line)) return true;
  if (SECTION_START_PATTERNS.some((pattern) => pattern.test(line))) return true;
  if (/points discussed/i.test(line) && line.length <= 40) return true;
  if (extractFirstEmail(line) && line.length <= 120) return true;
  return false;
}

function findNextMeaningfulLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 4); index += 1) {
    const candidate = normalizeToken(lines[index]);
    if (!candidate || isUiNoiseLine(candidate) || isHeaderLabelLine(candidate)) continue;
    return candidate;
  }

  return '';
}

function findFirstMatchingLine(lines: string[], pattern: RegExp) {
  return (
    lines
      .map(normalizeToken)
      .find((line) => {
        const nextPattern = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''));
        return nextPattern.test(line);
      }) ?? ''
  );
}

function findFirstEmailLine(lines: string[]) {
  return lines.map(normalizeToken).find((line) => extractFirstEmail(line)) ?? '';
}

function parseNameAndEmailLine(line: string) {
  const email = extractFirstEmail(line);
  if (!email) {
    return {
      fromName: '',
      fromEmail: '',
    };
  }

  return {
    fromName: extractDisplayName(line, email),
    fromEmail: email,
  };
}

function extractDateCandidate(text: string) {
  const patterns = [
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s+\d{1,2}\s+\w+\s+\d{4}(?:\s+at|\s+בשעה)?(?:\s+\d{1,2}:\d{2}(?:\s?[AP]M)?)?/i,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:[,\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)?/i,
    /\b\d{4}-\d{2}-\d{2}(?:[T\s]+\d{1,2}:\d{2}(?::\d{2})?)?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }

  return '';
}

function detectBodyStartIndex(lines: string[]) {
  let headerHits = 0;

  for (let index = 0; index < Math.min(lines.length, 20); index += 1) {
    const line = lines[index].trim();
    if (!line) {
      if (headerHits >= 2) return index + 1;
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    if (HEADER_KEYS.has(key)) headerHits += 1;
  }

  return 0;
}

function shouldStopBodyCapture(line: string) {
  return (
    /^on .+wrote:$/i.test(line) ||
    /^from:\s/i.test(line) ||
    /^sent:\s/i.test(line) ||
    /^date:\s/i.test(line) ||
    /^subject:\s/i.test(line) ||
    /^to:\s/i.test(line) ||
    /^cc:\s/i.test(line) ||
    /^-{2,}\s*original message\s*-{2,}$/i.test(line) ||
    /^begin forwarded message:?$/i.test(line)
  );
}

function isGreetingLine(line: string) {
  return /^(hi|hello|hey|dear|shalom|שלום)\b/i.test(line) && line.length <= 40;
}

function buildFallbackSummary(text: string) {
  const lines = normalizeLineEndings(text)
    .split('\n')
    .map(normalizeToken)
    .filter(Boolean)
    .filter((line) => !isLikelyMetadataLine(line))
    .filter((line) => !isGreetingLine(line))
    .filter((line) => !/^(thanks|thank you|best|regards|cheers|תודה|בברכה)\b/i.test(line));

  const summary = lines.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
  return summary ? appendUrls(summary, text) : appendUrls('', text);
}

function extractTopSubjectCandidate(lines: string[]) {
  for (const rawLine of lines.slice(0, 12)) {
    const line = normalizeToken(rawLine);
    if (!line) continue;
    if (isUiNoiseLine(line) || isHeaderLabelLine(line)) continue;
    if (extractFirstEmail(line)) continue;
    if (extractDateCandidate(line)) continue;
    if (/^(to|cc|from)\b/i.test(line)) continue;
    if (line.length < 4) continue;
    return line;
  }

  return '';
}

function buildFallbackSubject(subject: string, summary: string, lines: string[]) {
  if (subject) return subject;

  const topSubject = extractTopSubjectCandidate(lines);
  if (topSubject) return topSubject;

  const firstSentence = summary
    .split('\n')
    .flatMap((line) => line.split(/[.!?]/))
    .map((line) => normalizeToken(line))
    .find(Boolean);

  if (firstSentence) {
    return firstSentence.length <= 110 ? firstSentence : `${firstSentence.slice(0, 107).trimEnd()}...`;
  }

  return '';
}

function extractSummary(text: string) {
  const lines = normalizeLineEndings(text)
    .split('\n')
    .map(normalizeToken)
    .filter(Boolean)
    .filter((line) => !isUiNoiseLine(line));

  const sectionIndex = lines.findIndex((line) => SECTION_START_PATTERNS.some((pattern) => pattern.test(line)));
  if (sectionIndex !== -1) {
    const sectionLines: string[] = [];
    for (const line of lines.slice(sectionIndex + 1)) {
      if (SECTION_STOP_PATTERNS.some((pattern) => pattern.test(line))) break;
      if (isHeaderLabelLine(line)) break;
      if (isUiNoiseLine(line)) continue;

      const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
      if (!cleaned || isLikelyMetadataLine(cleaned)) continue;
      sectionLines.push(cleaned);
      if (sectionLines.join(' ').length >= 260 || sectionLines.length >= 4) break;
    }

    const sectionSummary = sectionLines.join(' ').replace(/\s+/g, ' ').trim();
    if (sectionSummary) {
      const shortened =
        sectionSummary.length <= 240 ? sectionSummary : `${sectionSummary.slice(0, 237).trimEnd()}...`;
      return appendUrls(shortened, text);
    }
  }

  const startIndex = detectBodyStartIndex(lines);
  const collected: string[] = [];

  for (const rawLine of lines.slice(startIndex)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (shouldStopBodyCapture(line)) break;
    if (isGreetingLine(line)) continue;
    if (isLikelyMetadataLine(line)) continue;
    if (/^(thanks|thank you|best|regards|cheers)[,!]?\s*$/i.test(line)) continue;
    if (/^(re|fw|fwd):/i.test(line) && collected.length === 0) continue;

    collected.push(line);
    if (collected.join(' ').length >= 260 || collected.length >= 3) break;
  }

  const summary = collected.join(' ').replace(/\s+/g, ' ').trim();
  if (!summary) return buildFallbackSummary(text);
  if (summary.length <= 240) return appendUrls(summary, text);

  const shortened = summary.slice(0, 237);
  const lastSpaceIndex = shortened.lastIndexOf(' ');
  return appendUrls(`${(lastSpaceIndex > 120 ? shortened.slice(0, lastSpaceIndex) : shortened).trim()}...`, text);
}

function parseOccurredAt(value: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

export function parseCommunicationEmail(
  rawText: string,
  options?: { referenceEmails?: string[] }
): ParsedCommunicationEntryDraft | null {
  const normalizedText = normalizeLineEndings(rawText).trim();
  if (!normalizedText) return null;

  const lines = normalizedText.split('\n');
  const fromValue = extractHeaderValue(lines, ['from', 'from / with']);
  const toValue = extractHeaderValue(lines, ['to']);
  const ccValue = extractHeaderValue(lines, ['cc']);
  const subjectValue = extractHeaderValue(lines, ['subject']);
  const occurredAtValue = extractHeaderValue(lines, ['date', 'sent']) || extractDateCandidate(normalizedText);
  const summary = extractSummary(normalizedText);

  const fromEmail = extractFirstEmail(fromValue);
  const fromName = extractDisplayName(fromValue, fromEmail);
  const referenceEmails = new Set((options?.referenceEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean));
  const recipientEmails = [...extractAllEmails(toValue), ...extractAllEmails(ccValue)];
  const firstEmailInText = findFirstEmailLine(lines);
  const firstNameEmailPair = firstEmailInText ? parseNameAndEmailLine(firstEmailInText) : { fromName: '', fromEmail: '' };
  const subjectLabelIndex = lines.findIndex((line) => normalizeToken(line).toLowerCase() === 'subject');
  const fallbackSubjectLine =
    findFirstMatchingLine(lines, /^(re|fw|fwd):/i) ||
    (subjectLabelIndex >= 0 ? findNextMeaningfulLine(lines, subjectLabelIndex + 1) : '');

  let direction: ProjectCommunicationDirection | undefined;
  if (fromEmail && referenceEmails.has(fromEmail.toLowerCase())) {
    direction = 'incoming';
  } else if (recipientEmails.some((email) => referenceEmails.has(email))) {
    direction = 'outgoing';
  }

  const result: ParsedCommunicationEntryDraft = {};

  const normalizedFallbackSubject = fallbackSubjectLine ? normalizeToken(fallbackSubjectLine) : '';
  const nextSummary = summary || buildFallbackSummary(normalizedText);
  const nextSubject = buildFallbackSubject(subjectValue || normalizedFallbackSubject, nextSummary, lines);

  if (nextSubject) result.subject = nextSubject;
  if (nextSummary) result.summary = nextSummary;
  if (fromName) result.fromName = fromName;
  else if (firstNameEmailPair.fromName) result.fromName = firstNameEmailPair.fromName;
  if (fromEmail) result.fromEmail = fromEmail;
  else if (firstNameEmailPair.fromEmail) result.fromEmail = firstNameEmailPair.fromEmail;
  if (direction) result.direction = direction;

  const occurredAt = parseOccurredAt(occurredAtValue);
  if (occurredAt) result.occurredAt = occurredAt;

  if (
    !result.subject &&
    !result.summary &&
    !result.fromName &&
    !result.fromEmail &&
    !result.occurredAt &&
    !result.direction
  ) {
    return null;
  }

  return result;
}
