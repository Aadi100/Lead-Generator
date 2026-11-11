export type LiveState = 'connecting' | 'live' | 'offline';

export type WorkerInfo = { loaded: boolean; online: boolean; claude: boolean; lastSeen: string | null };
