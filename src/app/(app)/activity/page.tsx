"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { FEED_KINDS, FEED_LABEL, FEED_PAGE, FEED_TABLES, dayKey, dayLabel, fetchFeedPage, parseKinds, type FeedItem, type FeedKind } from '@/lib/activity-page';
import { PageContainer, PageHeader } from '@/components/shell';
import { Banner, Button, Chip, EmptyState, SkeletonRows } from '@/components/ui';
import { ActivityIcon, RefreshIcon } from '@/components/Icons';
import FeedItemRow from '@/components/activity/FeedItemRow';

function ActivityView() {
  const router = useRouter();
  const params = useSearchParams();
  const kinds = useMemo(() => parseKinds(params.get('type')), [params]);
  const kindsKey = kinds.join(',');

  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seq = useRef(0);
  const itemsRef = useRef<FeedItem[]>([]);
  itemsRef.current = items;

  const loadFirst = useCallback(async () => {
    const my = ++seq.current;
    const res = await fetchFeedPage(kinds, null);
    if (my !== seq.current) return;
    setItems(res.items);
    setHasMore(res.hasMore);
    setError(res.error);
    setLoading(false);
    // kindsKey identifies kinds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey]);

  // Realtime: re-read the newest page and merge it into what is already loaded.
  const refreshTop = useCallback(async () => {
    const my = seq.current;
    const res = await fetchFeedPage(kinds, null);
    if (my !== seq.current || res.error) return;
    const known = new Set(itemsRef.current.map((i) => i.id));
    const added = res.items.filter((i) => !known.has(i.id)).map((i) => i.id);
    setItems((cur) => {
      const map = new Map(cur.map((i) => [i.id, i]));
      for (const i of res.items) map.set(i.id, i);
      return Array.from(map.values()).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    });
    if (added.length > 0) {
      setFresh(new Set(added));
      setTimeout(() => setFresh(new Set()), 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey]);

  useEffect(() => {
    setLoading(true);
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshTop(), 600);
    };
    let ch = supabase.channel(`activity-live-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of FEED_TABLES) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    ch.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [refreshTop]);

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const my = seq.current;
    const res = await fetchFeedPage(kinds, last.at);
    if (my !== seq.current) return;
    setItems((cur) => {
      const ids = new Set(cur.map((i) => i.id));
      return [...cur, ...res.items.filter((i) => !ids.has(i.id))];
    });
    setHasMore(res.hasMore);
    if (res.error) setError(res.error);
    setLoadingMore(false);
  };

  const setKinds = (next: FeedKind[]) => {
    const q = new URLSearchParams(params.toString());
    if (next.length === 0 || next.length === FEED_KINDS.length) q.delete('type');
    else q.set('type', next.join(','));
    const s = q.toString();
    router.replace(s ? `/activity?${s}` : '/activity', { scroll: false });
  };
  const toggle = (k: FeedKind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);

  const groups = useMemo(() => {
    const out: { key: string; items: FeedItem[] }[] = [];
    for (const i of items) {
      const k = dayKey(i.at);
      const g = out[out.length - 1];
      if (g && g.key === k) g.items.push(i);
      else out.push({ key: k, items: [i] });
    }
    return out;
  }, [items]);

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Activity"
        subtitle="Everything that happened, newest first."
        actions={
          <Button variant="secondary" leftIcon={<RefreshIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void loadFirst()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type">
        <Chip selected={kinds.length === 0} onClick={() => setKinds([])}>
          Everything
        </Chip>
        {FEED_KINDS.map((k) => (
          <Chip key={k} selected={kinds.includes(k)} onClick={() => toggle(k)}>
            {FEED_LABEL[k]}
          </Chip>
        ))}
      </div>

      {error && (
        <Banner tone="danger" title="Could not load activity" className="mb-4" action={<Button size="sm" onClick={() => void loadFirst()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      {loading ? (
        <SkeletonRows rows={8} rowClassName="h-14" />
      ) : items.length === 0 && !error ? (
        <EmptyState
          icon={<ActivityIcon className="h-5 w-5" aria-hidden="true" />}
          title="Nothing here yet"
          text={kinds.length ? 'No activity of this type yet. Try another filter.' : 'New leads, sent messages, replies, deals and finished tasks will show up here as they happen.'}
          action={kinds.length ? <Button variant="secondary" onClick={() => setKinds([])}>Show everything</Button> : undefined}
        />
      ) : (
        <div aria-live="polite">
          {groups.map((g) => (
            <section key={g.key} aria-label={dayLabel(g.key)} className="mb-4">
              <h2 className="glass-subtle sticky top-14 z-10 -mx-1 mb-2 rounded-ctl px-3 py-1.5 text-[13px] font-semibold text-fg-muted">{dayLabel(g.key)}</h2>
              <ul className="grid gap-1.5">
                {g.items.map((i) => (
                  <FeedItemRow key={i.id} item={i} fresh={fresh.has(i.id)} />
                ))}
              </ul>
            </section>
          ))}
          {hasMore && items.length >= FEED_PAGE && (
            <div className="flex justify-center py-3">
              <Button variant="secondary" size="lg" loading={loadingMore} onClick={() => void loadMore()}>
                Load more
              </Button>
            </div>
          )}
          {!hasMore && items.length > 0 && <p className="py-3 text-center text-xs text-fg-subtle">That is everything.</p>}
        </div>
      )}
    </PageContainer>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityView />
    </Suspense>
  );
}
