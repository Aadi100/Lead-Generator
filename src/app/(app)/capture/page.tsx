"use client";

import { useEffect, useState } from 'react';
import { decodeCapture, type CapturePayload } from '@/lib/capture';
import { Banner, Stagger } from '@/components/ui';
import { PageContainer, PageHeader } from '@/components/shell';
import InstallCard from '@/components/capture/InstallCard';
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
      <PageHeader
        title="Capture leads from any site"
        subtitle="Marketplaces such as Eldorado, G2G, Z2U, FunPay and PlayerAuctions, plus Discord servers and Telegram groups you have joined, and forums, are not scraped for you. Most of them block bots or forbid it. Instead, while you browse them yourself, one click on a bookmark sends what you see to Lead Radar. You review it, then save it."
      />

      <Stagger className="space-y-5">
        {error && (
          <Banner tone="danger" title="Could not read the captured data" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
        {payload && <ReviewCard payload={payload} onDismiss={() => setPayload(null)} />}

        {!payload && !error && (
          <Banner tone="info" title="Nothing captured yet">
            Install the bookmark below, open a site, and click it. Or paste text further down.
          </Banner>
        )}

        <InstallCard />
        <PasteCard />
      </Stagger>
    </PageContainer>
  );
}

export default function CapturePage() {
  return <CaptureView />;
}
