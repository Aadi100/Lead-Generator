import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sb } from './lib/db.mjs';
import { log } from './lib/log.mjs';
import { setSetting } from './lib/settings.mjs';
import { claudeStatus } from './lib/claude.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const startedAt = new Date().toISOString();
const jobHandlers = {};
const tasks = [];

const files = fs.readdirSync(path.join(dir, 'handlers')).filter((f) => f.endsWith('.mjs')).sort();
for (const f of files) {
  try {
    const mod = await import(pathToFileURL(path.join(dir, 'handlers', f)).href);
    Object.assign(jobHandlers, mod.jobs || {});
    for (const t of mod.tasks || []) tasks.push({ ...t, file: f });
    log('boot', `${f}: ${Object.keys(mod.jobs || {}).length} jobs, ${(mod.tasks || []).length} tasks`);
  } catch (e) {
    log('boot', `FAILED to load ${f}: ${e.message}`);
  }
}

let claude = await claudeStatus();
log('boot', `Claude CLI: ${claude.available ? claude.version : 'not available (' + claude.error + ')'}`);

const now = () => new Date().toISOString();
await sb.from('jobs').update({ status: 'failed', error: 'Worker restarted while this job was running', finished_at: now() }).eq('status', 'running');
await sb.from('outreach').update({ status: 'failed', error: 'Worker restarted while sending. Check your Sent folder before retrying.' }).eq('status', 'sending');
await sb.from('leads').update({ enrich_status: 'pending' }).eq('enrich_status', 'running');

async function beat() {
  try {
    await setSetting('worker_status', {
      last_seen: now(), started_at: startedAt, pid: process.pid, claude,
      handlers: files, jobs: Object.keys(jobHandlers),
    });
  } catch (e) {
    log('heartbeat', e.message);
  }
}
await beat();
setInterval(beat, 10000);
setInterval(async () => { claude = await claudeStatus(); }, 5 * 60 * 1000);

const running = new Set();
let polling = false;
async function runJob(job) {
  try {
    const handler = jobHandlers[job.type];
    if (!handler) throw new Error(`Unknown job type: ${job.type}`);
    log('job', `${job.type} ${job.id.slice(0, 8)} started`);
    const result = await handler(job);
    await sb.from('jobs').update({ status: 'done', result: result ?? {}, finished_at: now() }).eq('id', job.id);
    log('job', `${job.type} ${job.id.slice(0, 8)} done`);
  } catch (e) {
    log('job', `${job.type} ${job.id.slice(0, 8)} FAILED: ${e.message}`);
    await sb.from('jobs').update({ status: 'failed', error: String(e.message || e).slice(0, 800), finished_at: now() }).eq('id', job.id);
  }
}
async function pollJobs() {
  if (polling || running.size >= 3) return;
  polling = true;
  try {
    const { data } = await sb.from('jobs').select('*').eq('status', 'queued').order('created_at').limit(5);
    for (const job of data || []) {
      if (running.size >= 3) break;
      const { data: claimed } = await sb.from('jobs').update({ status: 'running', started_at: now() }).eq('id', job.id).eq('status', 'queued').select().maybeSingle();
      if (!claimed) continue;
      running.add(job.id);
      runJob(claimed).finally(() => running.delete(job.id));
    }
  } catch (e) {
    log('jobs', e.message);
  } finally {
    polling = false;
  }
}
setInterval(pollJobs, 2000);

for (const t of tasks) {
  const loop = async () => {
    try {
      await t.run();
    } catch (e) {
      log(t.name, 'error:', e.message);
    }
    setTimeout(loop, t.everyMs);
  };
  setTimeout(loop, t.initialDelayMs ?? 2000 + Math.random() * 3000);
}

process.on('unhandledRejection', (e) => log('error', 'unhandled rejection:', e?.message || e));
process.on('SIGINT', () => { log('boot', 'stopping'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
log('boot', `worker running: ${tasks.length} tasks, ${Object.keys(jobHandlers).length} job types`);
