import { runClaude, claudeStatus } from '../lib/claude.mjs';

export const jobs = {
  // Queued by Settings > AI writer ("Test the AI"). Sends one tiny question to the AI that is switched on.
  async ai_test() {
    const status = await claudeStatus();
    if (!status.available) throw new Error('No key saved for this AI yet. Paste it and press Save first.');
    const started = Date.now();
    const text = await runClaude('Reply with the single word: OK', { system: 'You are a connection test. Answer with one short word.', timeoutMs: 60000 });
    return { provider: status.provider, using: status.version, reply: String(text).slice(0, 80), ms: Date.now() - started };
  },
};
