import { log } from '../lib/log.mjs';
import { assistReply, assistScan } from '../lib/reply-assist-db.mjs';

// "Suggest reply" button and the automatic run share this job. It only ever creates a draft.
export const jobs = {
  async reply_assist(job) {
    const id = job.payload?.reply_id;
    if (!id) throw new Error('reply_id is required');
    return assistReply(id, { instruction: job.payload?.instruction || undefined, force: !job.payload?.auto });
  },
};

export const tasks = [
  {
    name: 'reply-assist-scan', everyMs: 20000, initialDelayMs: 9000,
    async run() {
      const n = await assistScan();
      if (n) log('reply-assist', `queued ${n} reply suggestion(s)`);
    },
  },
];
