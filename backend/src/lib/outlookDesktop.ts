import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const APPLE_SCRIPT_LINES = [
  'on run argv',
  '  set queryText to item 1 of argv',
  '  set the clipboard to queryText',
  '  tell application "Microsoft Outlook"',
  '    activate',
  '  end tell',
  '  delay 0.8',
  '  tell application "System Events"',
  '    keystroke "1" using {command down}',
  '    delay 0.25',
  '    keystroke "f" using {command down, option down}',
  '    delay 0.25',
  '    keystroke "a" using {command down}',
  '    key code 51',
  '    delay 0.1',
  '    keystroke "v" using {command down}',
  '    delay 0.1',
  '    key code 36',
  '  end tell',
  'end run',
] as const;

export class OutlookDesktopError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'OutlookDesktopError';
    this.statusCode = statusCode;
  }
}

function normalizeAutomationError(message: string) {
  if (message.includes('not allowed to send keystrokes')) {
    return new OutlookDesktopError(
      'macOS blocked Outlook automation. Allow Terminal or your local app under System Settings > Privacy & Security > Accessibility, then try again.',
      403
    );
  }

  if (message.includes('Can’t get application "Microsoft Outlook"')) {
    return new OutlookDesktopError(
      'Microsoft Outlook could not be opened for automation. Open Outlook once on this Mac and try again.',
      503
    );
  }

  return new OutlookDesktopError('Outlook search could not be launched on this Mac.');
}

export async function launchOutlookDesktopSearch(query: string) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new OutlookDesktopError('Search query is required.', 400);
  }

  try {
    await execFileAsync(
      '/usr/bin/osascript',
      [...APPLE_SCRIPT_LINES.flatMap((line) => ['-e', line]), '--', trimmedQuery],
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? [error.message, (error as { stderr?: string }).stderr, (error as { stdout?: string }).stdout]
            .filter(Boolean)
            .join('\n')
        : String(error);

    throw normalizeAutomationError(message);
  }
}
