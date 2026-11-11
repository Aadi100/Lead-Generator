import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BIN = process.env.CLAUDE_BIN || 'claude';
const NEUTRAL_DIR = path.join(os.tmpdir(), 'lead-radar-claude');
fs.mkdirSync(NEUTRAL_DIR, { recursive: true });

let chain = Promise.resolve();

function exec(args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, args, { cwd: NEUTRAL_DIR, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Claude CLI could not start: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`Claude CLI exited with code ${code}: ${(err || out).trim().slice(-300)}`));
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

export async function claudeStatus() {
  try {
    const version = await exec(['--version'], '', 15000);
    return { available: true, version: version.split('\n')[0], bin: BIN };
  } catch (e) {
    return { available: false, version: null, bin: BIN, error: e.message };
  }
}

// One call at a time so a burst of jobs cannot burn through the plan's rate limit.
export function runClaude(prompt, { system, timeoutMs = 180000 } = {}) {
  const run = () => {
    const args = ['-p', '--output-format', 'text', '--tools', '', '--no-session-persistence'];
    if (system) args.push('--system-prompt', system);
    return exec(args, prompt, timeoutMs);
  };
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

export function extractJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstObj = t.indexOf('{');
  const firstArr = t.indexOf('[');
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) throw new Error('No JSON found in the AI reply');
  const open = t[start];
  const end = t.lastIndexOf(open === '{' ? '}' : ']');
  if (end <= start) throw new Error('Incomplete JSON in the AI reply');
  return JSON.parse(t.slice(start, end + 1));
}
