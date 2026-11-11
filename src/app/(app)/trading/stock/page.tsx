"use client";

import { Suspense } from 'react';
import { PageContainer } from '@/components/shell';
import { SkeletonRows } from '@/components/ui';
import StockBoard from '@/components/trading/StockBoard';

export default function Page() {
  return (
    <PageContainer>
      <Suspense fallback={<SkeletonRows rows={4} rowClassName="h-28" />}>
        <StockBoard />
      </Suspense>
    </PageContainer>
  );
}
