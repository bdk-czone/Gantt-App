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

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    model,
  };
}

export function getCommunicationAIStatus() {
  const config = getOpenAIConfig();
  return {
    configured: config.configured,
    provider: config.configured ? 'openai' : null,
    model: config.configured ? config.model : null,
  };
}

function normalizeEmails(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeKeywords(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
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

function buildPrompt(request: CommunicationAIRequest) {
  const projectName = request.projectName?.trim() || 'Unknown project';
  const customerName = request.customerName?.trim() || '';
  const referenceEmails = normalizeEmails(request.referenceEmails);
  const referenceKeywords = normalizeKeywords(request.referenceKeywords);

  return [
    'You turn a pasted email or email screenshot into a structured project communication log entry.',
    'Return concise factual data only. Do not invent people, dates, or actions.',
    'If a field is missing, return an empty string, except direction which should be "unknown".',
    'The summary must be 1-2 short sentences, max 280 characters, written as a neutral case log note.',
    'Use "incoming" when the message is from the customer/contact to the user.',
    'Use "outgoing" when the message is from the user/team to the customer/contact.',
    'Use "note" only if the content is clearly not an email.',
    'If you cannot tell the direction, return "unknown".',
    `Project name: ${projectName}`,
    customerName ? `Customer name: ${customerName}` : '',
    referenceEmails.length > 0 ? `Customer/reference emails: ${referenceEmails.join(', ')}` : '',
    referenceKeywords.length > 0 ? `Reference keywords: ${referenceKeywords.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildInput(request: CommunicationAIRequest) {
  const content: Array<Record<string, string>> = [];

  if (request.rawText?.trim()) {
    content.push({
      type: 'input_text',
      text: `Pasted email or thread text:\n\n${request.rawText.trim()}`,
    });
  }

  if (request.imageDataUrl?.trim()) {
    content.push({
      type: 'input_text',
      text: 'Analyze this screenshot of an email and extract the best log entry draft.',
    });
    content.push({
      type: 'input_image',
      image_url: validateImageDataUrl(request.imageDataUrl),
      detail: 'high',
    });
  }

  if (content.length === 0) {
    throw new CommunicationAIError('Provide pasted email text or a pasted screenshot first.', 400);
  }

  return [
    {
      role: 'user',
      content,
    },
  ];
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (Array.isArray(payload?.output)) {
    const textParts = payload.output.flatMap((item: any) =>
      Array.isArray(item?.content)
        ? item.content
            .map((part: any) => {
              if (typeof part?.text === 'string') return part.text;
              if (typeof part?.output_text === 'string') return part.output_text;
              return '';
            })
            .filter(Boolean)
        : []
    );

    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }

  throw new CommunicationAIError('The AI response did not include a usable draft.', 502);
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

export async function generateCommunicationAIDraft(request: CommunicationAIRequest): Promise<CommunicationAIDraft> {
  const config = getOpenAIConfig();
  if (!config.configured) {
    throw new CommunicationAIError('AI assist is not configured. Add OPENAI_API_KEY to the backend environment first.', 400);
  }

  const response = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: buildInput(request),
      instructions: buildPrompt(request),
      text: {
        format: {
          type: 'json_schema',
          name: 'communication_log_entry',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              occurredAt: {
                type: 'string',
                description: 'ISO 8601 datetime if known, otherwise an empty string.',
              },
              direction: {
                type: 'string',
                enum: ['incoming', 'outgoing', 'note', 'unknown'],
              },
              fromName: {
                type: 'string',
              },
              fromEmail: {
                type: 'string',
              },
              subject: {
                type: 'string',
              },
              summary: {
                type: 'string',
              },
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
        : 'The AI provider could not analyze that email.';
    throw new CommunicationAIError(apiError, response.status >= 400 && response.status < 500 ? 400 : 502);
  }

  const outputText = extractOutputText(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new CommunicationAIError('The AI returned an invalid draft format.', 502);
  }

  return normalizeDraft(parsed);
}
