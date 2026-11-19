"use client";

import { useEffect, useState } from 'react';
import { decodeCapture, type CapturePayload } from '@/lib/capture';
import { Banner, Stagger } from '@/components/ui';
import { PageContainer, PageHeader } from '@/components/shell';
import InstallCard from '@/components/capture/InstallCard';
import Advanced from '@/components/settings/Advanced';
import PasteCard from '@/components/capture/PasteCard';
import ReviewCard from '@/components/capture/ReviewCard';

function CaptureView() {
  const [payload, setPayload] = useState<CapturePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#d=')) return;
    const res = decodeCapture(hash);
    if (res.ok) setPayload(res.payload);
    else setError(res.error);
    // The data can be large and is only needed once, so the address bar is cleaned right away.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  return (
    <PageContainer width="narrow">
      <PageHeader title="Capture a lead" subtitle="Found someone on a site we do not search for you? Send them here in one click." />

      <Stagger className="space-y-5">
        {error && (
          <Banner tone="danger" title="Could not read the captured data" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
        {payload && <ReviewCard payload={payload} onDismiss={() => setPayload(null)} />}

        {!payload && !error && (
          <Banner tone="info" title="Nothing captured yet">
            Follow the three steps below. Your first capture shows up here to check.
          </Banner>
        )}

        <InstallCard />
        <Advanced id="capture-other" title="Other ways to add a lead" hint="Paste text from anywhere, such as a message or a forum post.">
          <PasteCard />
        </Advanced>
      </Stagger>
    </PageContainer>
  );
}

export default function CapturePage() {
  return <CaptureView />;
}
