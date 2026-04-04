import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export class CommunicationOCRError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'CommunicationOCRError';
    this.statusCode = statusCode;
  }
}

function findSwiftScriptPath() {
  const candidates = [
    path.resolve(__dirname, 'communicationOcr.swift'),
    path.resolve(__dirname, '../../src/lib/communicationOcr.swift'),
  ];

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) {
    throw new CommunicationOCRError('Local OCR script is missing.', 500);
  }

  return existing;
}

function parseImageDataUrl(dataUrl: string) {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new CommunicationOCRError('Paste a PNG, JPG, WEBP, or GIF screenshot first.', 400);
  }

  const base64Payload = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64Payload, 'base64');
  if (buffer.length === 0) {
    throw new CommunicationOCRError('The pasted screenshot could not be decoded.', 400);
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new CommunicationOCRError('The pasted screenshot is too large. Please crop it and try again.', 413);
  }

  return buffer;
}

export async function extractTextFromScreenshotDataUrl(dataUrl: string) {
  const imageBuffer = parseImageDataUrl(dataUrl);
  const scriptPath = findSwiftScriptPath();

  return new Promise<string>((resolve, reject) => {
    const child = spawn('swift', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new CommunicationOCRError(`Local OCR could not start: ${error.message}`, 500));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new CommunicationOCRError(
          stderr.trim() || 'Local OCR could not read that screenshot.',
          code === 127 ? 500 : 400
        )
      );
    });

    child.stdin.write(imageBuffer);
    child.stdin.end();
  });
}
