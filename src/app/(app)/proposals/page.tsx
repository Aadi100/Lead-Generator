"use client";

import { Suspense } from 'react';
import { PageContainer, PageHeader } from '@/components/shell';
import { SkeletonRows } from '@/components/ui';
import ProposalsView from '@/components/proposals/ProposalsView';

export default function Page() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageHeader title="Proposals" subtitle="Quotes you build from a lead or deal, as a clean one page PDF." />
          <SkeletonRows rows={6} rowClassName="h-16" />
        </PageContainer>
      }
    >
      <ProposalsView />
    </Suspense>
  );
}
