"use client";

import { Suspense } from 'react';
import { PageContainer, PageHeader } from '@/components/shell';
import { SkeletonRows } from '@/components/ui';
import DealsView from '@/components/deals/DealsView';

export default function Page() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageHeader title="Deals" subtitle="Open and closed deals, with value, cost and stage." />
          <SkeletonRows rows={6} rowClassName="h-16" />
        </PageContainer>
      }
    >
      <DealsView />
    </Suspense>
  );
}
