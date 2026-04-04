type CommunicationDirection = 'incoming' | 'outgoing' | 'note' | 'unknown';

export interface CommunicationAIDraft {
  occurredAt: string;
  direction: CommunicationDirection;
  fromName: string;
  fromEmail: string;
  subject: string;
  summary: string;
}

export interface CommunicationAIRequest {
  projectName?: string;
  customerName?: string;
  referenceEmails?: string[];
  referenceKeywords?: string[];
  rawText?: string;
  imageDataUrl?: string;
}

export class CommunicationAIError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'CommunicationAIError';
    this.statusCode = statusCode;
  }
}

// ── Provider config ────────────────────────────────────────────────────────────

// Native Gemini REST API (not OpenAI-compat shim)
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return { configured: Boolean(apiKey), apiKey, model, baseUrl: GEMINI_BASE_URL };
}

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || OPENAI_BASE_URL).replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  return { configured: Boolean(apiKey), apiKey, model, baseUrl };
}

/** Returns the active provider. Gemini takes priority over OpenAI. */
function getActiveProvider() {
  const gemini = getGeminiConfig();
  if (gemini.configured) return { ...gemini, name: 'gemini' as const };

  const openai = getOpenAIConfig();
  if (openai.configured) return { ...openai, name: 'openai' as const };

  return null;
}

export function getCommunicationAIStatus() {
  const provider = getActiveProvider();
  return {
    configured: Boolean(provider),
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
  };
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function normalizeEmails(values: string[] | undefined) {
  return (values ?? []).map((v) => v.trim()).filter(Boolean);
}

function normalizeKeywords(values: string[] | undefined) {
  return (values ?? []).map((v) => v.trim()).filter(Boolean);
}

function validateImageDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:image/')) {
    throw new CommunicationAIError('Only pasted image screenshots are supported.', 400);
  }
  const separatorIndex = trimmed.indexOf(',');
  if (separatorIndex === -1) {
    throw new CommunicationAIError('The pasted screenshot could not be read.', 400);
  }
  const mimeMatch = trimmed.slice(0, separatorIndex).match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64$/i);
  if (!mimeMatch) {
    throw new CommunicationAIError('Use a PNG, JPG, WEBP, or GIF screenshot.', 400);
  }
  const base64Payload = trimmed.slice(separatorIndex + 1);
  const approxBytes = Math.ceil((base64Payload.length * 3) / 4);
  if (approxBytes > 8 * 1024 * 1024) {
    throw new CommunicationAIError('The pasted screenshot is too large. Please crop it and try again.', 413);
  }
  return trimmed;
}

function buildSystemPrompt(request: CommunicationAIRequest) {
  const projectName = request.projectName?.trim() || 'Unknown project';
  const customerName = request.customerName?.trim() || '';
  const referenceEmails = normalizeEmails(request.referenceEmails);
  const referenceKeywords = normalizeKeywords(request.referenceKeywords);

  return [
    'You turn a pasted email or email screenshot into a structured project communication log entry.',
    'Return ONLY a valid JSON object matching exactly this shape:',
    '{ "occurredAt": "ISO8601 or empty string", "direction": "incoming|outgoing|note|unknown", "fromName": "string", "fromEmail": "string", "subject": "string", "summary": "string" }',
    'Rules:',
    '- Do not invent people, dates, or actions.',
    '- occurredAt: ISO 8601 datetime if clearly visible in the message, otherwise "".',
    '- direction: "incoming" = message from customer to user; "outgoing" = user to customer; "note" = not an email; "unknown" = cannot tell.',
    '- subject: prefer the email subject line or the first bold/header line. If missing, derive a short title from the content.',
    '- summary: 1-3 short sentences, max 320 characters, neutral case-log tone. Include any URLs mentioned.',
    '- If a field is missing, return an empty string.',
    '- Support Hebrew and English text in the screenshot.',
    `Project: ${projectName}`,
    customerName ? `Customer: ${customerName}` : '',
    referenceEmails.length > 0 ? `Customer/reference emails: ${referenceEmails.join(', ')}` : '',
    referenceKeywords.length > 0 ? `Reference keywords: ${referenceKeywords.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeDraft(value: any): CommunicationAIDraft {
  return {
    occurredAt: typeof value?.occurredAt === 'string' ? value.occurredAt.trim() : '',
    direction:
      value?.direction === 'incoming' || value?.direction === 'outgoing' || value?.direction === 'note'
        ? value.direction
        : 'unknown',
    fromName: typeof value?.fromName === 'string' ? value.fromName.trim() : '',
    fromEmail: typeof value?.fromEmail === 'string' ? value.fromEmail.trim() : '',
    subject: typeof value?.subject === 'string' ? value.subject.trim() : '',
    summary: typeof value?.summary === 'string' ? value.summary.trim() : '',
  };
}

// ── Gemini native REST API (/v1beta/models/{model}:generateContent) ───────────

async function callGemini(
  config: ReturnType<typeof getGeminiConfig>,
  request: CommunicationAIRequest,
  systemPrompt: string,
): Promise<CommunicationAIDraft> {
  // Build native Gemini parts array
  type GeminiPart =
    | { text: string }
    | { inline_data: { mime_type: string; data: string } };

  const parts: GeminiPart[] = [];

  if (request.rawText?.trim()) {
    parts.push({ text: `Pasted email or thread text:\n\n${request.rawText.trim()}` });
  }

  if (request.imageDataUrl?.trim()) {
    const validated = validateImageDataUrl(request.imageDataUrl);
    const commaIdx = validated.indexOf(',');
    const mimeMatch = validated.slice(0, commaIdx).match(/^data:(image\/[^;]+);base64$/i);
    const mimeType = mimeMatch![1].toLowerCase();
    const base64Data = validated.slice(commaIdx + 1);
    parts.push({ text: 'Analyze this email screenshot and extract the structured log entry.' });
    parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
  }

  if (parts.length === 0) {
    throw new CommunicationAIError('Provide pasted email text or a pasted screenshot first.', 400);
  }

  const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  const payload: any = await response.json().catch(() => null);

  if (!response.ok) {
    let apiError: string;
    if (response.status === 429) {
      apiError =
        typeof payload?.error?.message === 'string'
          ? `Gemini rate limit: ${payload.error.message}`
          : 'Gemini free-tier rate limit hit (429). Wait a moment and try again.';
    } else {
      apiError =
        typeof payload?.error?.message === 'string'
          ? payload.error.message
          : `Gemini returned HTTP ${response.status}.`;
    }
    throw new CommunicationAIError(apiError, response.status >= 400 && response.status < 500 ? 400 : 502);
  }

  const text: string = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text.trim()) {
    throw new CommunicationAIError('Gemini returned an empty response.', 502);
  }

  let parsed: unknown;
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CommunicationAIError('Gemini returned an invalid response format.', 502);
  }

  return normalizeDraft(parsed);
}

// ── OpenAI via /responses (legacy, kept as fallback) ──────────────────────────

async function callOpenAI(
  config: ReturnType<typeof getOpenAIConfig>,
  request: CommunicationAIRequest,
  systemPrompt: string,
): Promise<CommunicationAIDraft> {
  // Build OpenAI-specific input format for the /responses endpoint
  type ContentItem = Record<string, string>;
  const content: ContentItem[] = [];

  if (request.rawText?.trim()) {
    content.push({ type: 'input_text', text: `Pasted email or thread text:\n\n${request.rawText.trim()}` });
  }

  if (request.imageDataUrl?.trim()) {
    content.push({ type: 'input_text', text: 'Analyze this screenshot of an email and extract the best log entry draft.' });
    content.push({ type: 'input_image', image_url: validateImageDataUrl(request.imageDataUrl), detail: 'high' });
  }

  if (content.length === 0) {
    throw new CommunicationAIError('Provide pasted email text or a pasted screenshot first.', 400);
  }

  const response = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: [{ role: 'user', content }],
      instructions: systemPrompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'communication_log_entry',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              occurredAt: { type: 'string', description: 'ISO 8601 datetime if known, otherwise empty string.' },
              direction: { type: 'string', enum: ['incoming', 'outgoing', 'note', 'unknown'] },
              fromName: { type: 'string' },
              fromEmail: { type: 'string' },
              subject: { type: 'string' },
              summary: { type: 'string' },
            },
            required: ['occurredAt', 'direction', 'fromName', 'fromEmail', 'subject', 'summary'],
          },
        },
      },
    }),
  });

  const payload: any = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'OpenAI could not analyze that email.';
    throw new CommunicationAIError(apiError, response.status >= 400 && response.status < 500 ? 400 : 502);
  }

  // Extract text from /responses payload
  let outputText = '';
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    outputText = payload.output_text;
  } else if (Array.isArray(payload?.output)) {
    const parts = payload.output.flatMap((item: any) =>
      Array.isArray(item?.content)
        ? item.content
            .map((part: any) => (typeof part?.text === 'string' ? part.text : typeof part?.output_text === 'string' ? part.output_text : ''))
            .filter(Boolean)
        : []
    );
    outputText = parts.join('\n');
  }

  if (!outputText.trim()) {
    throw new CommunicationAIError('OpenAI returned an empty response.', 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new CommunicationAIError('OpenAI returned an invalid response format.', 502);
  }

  return normalizeDraft(parsed);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generateCommunicationAIDraft(request: CommunicationAIRequest): Promise<CommunicationAIDraft> {
  const provider = getActiveProvider();
  if (!provider) {
    throw new CommunicationAIError(
      'AI assist is not configured. Add GEMINI_API_KEY to backend/.env and restart the server.',
      400,
    );
  }

  const systemPrompt = buildSystemPrompt(request);

  if (provider.name === 'gemini') {
    return callGemini(provider, request, systemPrompt);
  }

  // OpenAI fallback
  return callOpenAI(provider, request, systemPrompt);
}
