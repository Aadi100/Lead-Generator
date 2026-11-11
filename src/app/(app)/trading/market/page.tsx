"use client";

import { Suspense } from 'react';
import { PageContainer } from '@/components/shell';
import { SkeletonRows } from '@/components/ui';
import TradingMarket from '@/components/trading/TradingMarket';

export default function Page() {
  return (
    <PageContainer>
      <Suspense fallback={<SkeletonRows rows={5} rowClassName="h-24" />}>
        <TradingMarket />
      </Suspense>
    </PageContainer>
  );
}
