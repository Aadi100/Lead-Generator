"use client";

import { useEffect, useRef, useState } from 'react';
import { buildBookmarklet } from '@/lib/bookmarklet';
import { copyText } from '@/lib/clipboard';
import { useShell } from '../AppShell';
import { Card, Notice, btnPrimary, btnSecondary } from '../ui';
import { Step } from './Step';
import { CopyIcon, SendIcon } from '../Icons';

const SITE_TIPS: { site: string; tip: string }[] = [
  { site: 'Eldorado, G2G, Z2U, FunPay', tip: 'Open a listing or search results page, then click the bookmark. It picks up each offer that shows a price.' },
  { site: 'Any other site', tip: 'Select the text you care about and click the bookmark. With nothing selected it looks for offers that show a price.' },
];

export default function InstallCard() {
  const { pushToast } = useShell();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    const built = buildBookmarklet(window.location.origin);
    setCode(built);
    setOrigin(window.location.origin);
    // React refuses javascript: links in JSX, so the address is set on the element itself.
    linkRef.current?.setAttribute('href', built);
  }, []);

  const copy = async () => {
    if (!code) return;
    const ok = await copyText(code);
    pushToast(ok ? 'success' : 'error', ok ? 'Bookmark code copied.' : 'Could not copy. Select the code and copy it by hand.');
  };

  return (
    <Card
      title="How it works"
      subtitle="Three steps. The first one is only needed once."
      className="glass"
    >
      <ol className="space-y-5">
        <Step n={1} title="Install the button" text="Drag the button below up to your bookmarks bar. Press Ctrl+Shift+B first if you cannot see the bar.">
          <div className="flex flex-wrap items-center gap-3">
            <a
              ref={linkRef}
              href="#"
              draggable
              onClick={(e) => {
                e.preventDefault();
                pushToast('info', 'Drag this button up to your bookmarks bar. Do not click it here: it works on other sites.');
              }}
              className={`${btnPrimary} min-h-11 cursor-grab select-none active:cursor-grabbing`}
            >
              <SendIcon className="h-4 w-4" />
              Send to Lead Radar
            </a>
            <p className="text-xs text-fg-subtle">If dragging does not work, make the bookmark by hand below.</p>
          </div>
          <details className="glass-subtle mt-3 rounded-card p-3">
            <summary className="cursor-pointer text-sm font-medium text-fg">Dragging does not work? Make it by hand</summary>
            <p className="mb-2 mt-2 text-xs text-fg-subtle">Create a new bookmark, call it Send to Lead Radar, and paste this code into its address (URL) field.</p>
            <textarea
              readOnly
              value={code}
              rows={3}
              aria-label="Bookmark code"
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-ctl border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-fg-muted"
            />
            <div className="mt-2">
              <button type="button" onClick={copy} disabled={!code} className={btnSecondary}>
                <CopyIcon className="h-4 w-4" />
                Copy code
              </button>
            </div>
          </details>
        </Step>

        <Step n={2} title="Open a post you like" text="Go to any page with an offer or request, in your normal browser tab.">
          <details>
            <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-primary-text">Show tips for each site</summary>
          <ul className="mt-2 space-y-2">
            {SITE_TIPS.map((t) => (
              <li key={t.site} className="rounded-ctl bg-surface-2/60 px-3 py-2 text-sm text-fg-muted">
                <span className="font-medium text-fg">{t.site}: </span>
                {t.tip}
              </li>
            ))}
          </ul>
          </details>
        </Step>

        <Step n={3} title="Click the button" text="This page opens with what it found. Untick anything you do not want, then press Save. Saved items appear in Leads." />
      </ol>

      <details className="mt-5">
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-primary-text">Show good to know</summary>
        <Notice tone="info">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>It only sees what is on your screen at that moment. It cannot see anything you have not opened.</li>
            <li>Fiverr buyer requests and Upwork jobs need you to be logged in, so Lead Radar never fetches them. Open one yourself and click the bookmark: it reads the request or job on screen. Upwork alert emails can also be read from your inbox (Settings &gt; Connections).</li>
            <li>It works best on pages that list offers with prices. On other pages, select the text first.</li>
            <li>Only capture from servers and groups you are a member of, and keep to each site&apos;s rules.</li>
            <li>The bookmark opens this dashboard at {origin || 'this address'}, so it only works on the computer where the dashboard runs.</li>
            <li>A few sites block bookmarks. If nothing happens, copy the text and use "Other ways to add a lead" below.</li>
            <li>If this page asks you to sign in, sign in and click the bookmark again.</li>
          </ul>
        </Notice>
      </details>
    </Card>
  );
}
