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
  { site: 'Discord', tip: 'Open Discord in your browser (discord.com/app), open the trading channel, scroll so the messages are on screen, then click the bookmark.' },
  { site: 'Telegram', tip: 'Select the text of a post with your mouse, then click the bookmark.' },
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
      title="Install the bookmark"
      subtitle="One-time setup. It adds a button to your browser that sends what you see on a page to Lead Radar."
      className="glass"
    >
      <ol className="space-y-5">
        <Step n={1} title="Drag this button onto your bookmarks bar" text="Show the bar first with Ctrl+Shift+B in Chrome and Edge.">
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
            <summary className="cursor-pointer text-sm font-medium text-fg">Making the bookmark by hand</summary>
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

        <Step n={2} title="Open the site you want and click the bookmark" text="A new tab opens here with what it found.">
          <ul className="space-y-2">
            {SITE_TIPS.map((t) => (
              <li key={t.site} className="rounded-ctl bg-surface-2/60 px-3 py-2 text-sm text-fg-muted">
                <span className="font-medium text-fg">{t.site}: </span>
                {t.tip}
              </li>
            ))}
          </ul>
        </Step>

        <Step n={3} title="Check what it found, then press Save" text="Untick anything you do not want. Saved items appear in Leads." />
      </ol>

      <div className="mt-5">
        <Notice tone="info">
          <p className="font-medium">Good to know</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>It only sees what is on your screen at that moment. It cannot see anything you have not opened.</li>
            <li>It works best on pages that list offers with prices. On other pages, select the text first.</li>
            <li>Only capture from servers and groups you are a member of, and keep to each site&apos;s rules.</li>
            <li>The bookmark opens this dashboard at {origin || 'this address'}, so it only works on the computer where the dashboard runs.</li>
            <li>A few sites block bookmarks. If nothing happens, copy the text and use Paste text below.</li>
            <li>If this page asks you to sign in, sign in and click the bookmark again.</li>
          </ul>
        </Notice>
      </div>
    </Card>
  );
}
