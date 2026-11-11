"use client";

import { Suspense } from 'react';
import { PageContainer } from '@/components/shell';
import { SkeletonRows } from '@/components/ui';
import TradeBoard from '@/components/trading/TradeBoard';

export default function Page() {
  return (
    <PageContainer>
      <Suspense fallback={<SkeletonRows rows={6} rowClassName="h-24" />}>
        <TradeBoard side="buyer" />
      </Suspense>
    </PageContainer>
  );
}
