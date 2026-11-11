"use client";

import { useParams } from 'next/navigation';
import ProposalEditor from '@/components/proposals/ProposalEditor';

export default function Page() {
  const params = useParams<{ id: string }>();
  return <ProposalEditor key={params.id} id={String(params.id)} />;
}
