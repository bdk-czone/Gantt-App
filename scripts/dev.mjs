import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let shuttingDown = false;
const children = [];

function pipeOutput(child, name, streamName) {
  const stream = child[streamName];
  const target = streamName === 'stdout' ? process.stdout : process.stderr;
  if (!stream) return;

  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      target.write(`[${name}] ${line}\n`);
    }
  });

  stream.on('end', () => {
    if (buffer.length > 0) {
      target.write(`[${name}] ${buffer}\n`);
      buffer = '';
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => process.exit(exitCode), 150);
}

function runService(name, relativeCwd, args) {
  const child = spawn(npmCommand, args, {
    cwd: path.join(rootDir, relativeCwd),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  children.push(child);
  pipeOutput(child, name, 'stdout');
  pipeOutput(child, name, 'stderr');

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const normalizedCode = code ?? (signal ? 1 : 0);
    const reason = signal ? `signal ${signal}` : `code ${normalizedCode}`;
    process.stderr.write(`[${name}] exited with ${reason}\n`);
    shutdown(normalizedCode);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

runService('backend', 'backend', ['run', 'dev']);
runService('frontend', 'frontend', ['run', 'dev']);
