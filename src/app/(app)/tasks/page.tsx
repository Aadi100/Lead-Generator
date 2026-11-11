"use client";

import { Suspense } from 'react';
import { PageContainer } from '@/components/shell';
import { Skeleton } from '@/components/ui';
import { TasksView } from '@/components/tasks/TasksView';

export default function Page() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Skeleton className="h-40 w-full" />
        </PageContainer>
      }
    >
      <TasksView />
    </Suspense>
  );
}
