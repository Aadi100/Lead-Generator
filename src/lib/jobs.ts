"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { Job, JobType } from './types';

export const JOB_TIMEOUT_MS = 3 * 60 * 1000;
export const TIMEOUT_MESSAGE =
  'The worker did not answer within 3 minutes. Make sure it is running (run npm run worker in the project folder).';

function normalizeJob(raw: Record<string, unknown>): Job {
  const status = raw.status === 'running' || raw.status === 'done' || raw.status === 'failed' ? raw.status : 'queued';
  const result = raw.result && typeof raw.result === 'object' && !Array.isArray(raw.result) ? (raw.result as Record<string, unknown>) : null;
  return {
    id: String(raw.id ?? ''),
    type: typeof raw.type === 'string' ? raw.type : '',
    payload: raw.payload && typeof raw.payload === 'object' ? (raw.payload as Record<string, unknown>) : {},
    status,
    result,
    error: typeof raw.error === 'string' ? raw.error : null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString(),
  };
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
): Promise<{ job: Job | null; error: string | null }> {
  const { data, error } = await supabase.from('jobs').insert({ type, payload }).select().single();
  if (error || !data) return { job: null, error: error?.message ?? 'Could not queue the job.' };
  return { job: normalizeJob(data as Record<string, unknown>), error: null };
}

export type JobOutcome = {
  phase: 'done' | 'failed' | 'timeout';
  job: Job | null;
  result: Record<string, unknown> | null;
  error: string | null;
};

// Follows one job until it finishes. Realtime gives the quick answer, polling is the safety net.
export function waitForJob(id: string, timeoutMs: number = JOB_TIMEOUT_MS): Promise<JobOutcome> {
  return new Promise((resolve) => {
    let finished = false;
    let channel: RealtimeChannel | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (outcome: JobOutcome) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
      resolve(outcome);
    };

    const fromJob = (job: Job): JobOutcome | null => {
      if (job.status === 'done') return { phase: 'done', job, result: job.result, error: null };
      if (job.status === 'failed') return { phase: 'failed', job, result: job.result, error: job.error ?? 'The job failed.' };
      return null;
    };

    const check = async () => {
      const { data } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
      if (!data) return;
      const out = fromJob(normalizeJob(data as Record<string, unknown>));
      if (out) finish(out);
    };

    channel = supabase
      .channel(`job-${id}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` }, (payload) => {
        const out = fromJob(normalizeJob(payload.new as Record<string, unknown>));
        if (out) finish(out);
      })
      .subscribe();

    poll = setInterval(() => void check(), 3000);
    timer = setTimeout(() => finish({ phase: 'timeout', job: null, result: null, error: TIMEOUT_MESSAGE }), timeoutMs);
    void check();
  });
}

export type JobPhase = 'idle' | 'running' | 'done' | 'failed' | 'timeout';

export function useJob() {
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = useCallback(async (type: JobType, payload: Record<string, unknown> = {}): Promise<JobOutcome> => {
    setPhase('running');
    setResult(null);
    setError(null);
    const queued = await enqueueJob(type, payload);
    if (queued.error || !queued.job) {
      const failed: JobOutcome = { phase: 'failed', job: null, result: null, error: queued.error };
      if (alive.current) {
        setPhase('failed');
        setError(queued.error);
      }
      return failed;
    }
    const outcome = await waitForJob(queued.job.id);
    if (alive.current) {
      setPhase(outcome.phase);
      setResult(outcome.result);
      setError(outcome.error);
    }
    return outcome;
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setError(null);
  }, []);

  return { phase, running: phase === 'running', result, error, start, reset };
}
