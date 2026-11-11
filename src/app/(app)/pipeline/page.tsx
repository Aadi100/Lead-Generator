"use client";

import { Suspense } from 'react';
import { PageContainer } from '@/components/shell';
import { Skeleton } from '@/components/ui';
import { PipelineBoard } from '@/components/pipeline/PipelineBoard';

export default function Page() {
  return (
    <Suspense
      fallback={
        <PageContainer width="full">
          <Skeleton className="h-64 w-full" />
        </PageContainer>
      }
    >
      <PipelineBoard />
    </Suspense>
  );
}
