import type { Tone } from '@/components/ui';
import type { ProposalStatus } from '@/lib/proposals-data';

export const STATUS_TONE: Record<ProposalStatus, Tone> = { draft: 'neutral', sent: 'info', accepted: 'success', declined: 'danger', expired: 'warning' };
