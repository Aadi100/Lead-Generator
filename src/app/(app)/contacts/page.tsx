"use client";

import { Suspense } from 'react';
import { PageContainer, PageHeader } from '@/components/shell';
import { SkeletonRows } from '@/components/ui';
import ContactsView from '@/components/contacts/ContactsView';

export default function Page() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageHeader title="Contacts" subtitle="Everyone your leads have led to, in one place." />
          <SkeletonRows rows={8} rowClassName="h-16" />
        </PageContainer>
      }
    >
      <ContactsView />
    </Suspense>
  );
}
