"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Lead = {
  id: string;
  title: string;
  description: string;
  budget: string;
  url: string;
  source: string;
  type: string;
  status: string;
  created_at: string;
};

const statusStyles: Record<string, string> = {
  New:     'bg-green-50 text-green-700 border-green-200',
  Pitched: 'bg-purple-50 text-purple-700 border-purple-200',
  Ignored: 'bg-gray-50 text-gray-500 border-gray-200',
  Closed:  'bg-blue-50 text-blue-700 border-blue-200',
};

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setLeads(data);
      setLoading(false);
    };

    initData();

    // Real-time subscription
    const channel = supabase
      .channel('public:leads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          setLeads((current) => [payload.new as Lead, ...current]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload) => {
          setLeads((current) =>
            current.map((lead) =>
              lead.id === payload.new.id ? (payload.new as Lead) : lead
            )
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [router]);

  const updateStatus = async (id: string, status: string) => {
    // Optimistic update — UI reflects change immediately
    setLeads((current) =>
      current.map((lead) => (lead.id === id ? { ...lead, status } : lead))
    );
    await supabase.from('leads').update({ status }).eq('id', id);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading Lead Engine...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <header className="mb-8 flex justify-between items-center max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Lead Radar</h1>
          <p className="text-slate-500 text-sm mt-1">
            {leads.length} leads · {leads.filter(l => l.status === 'New').length} new
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          Sign Out
        </button>
      </header>

      <div className="max-w-5xl mx-auto grid gap-4">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm flex flex-col gap-4"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-slate-800 truncate">
                  {lead.title}
                </h2>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-medium border border-blue-100">
                    {lead.source}
                  </span>
                  <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium border border-slate-200">
                    {lead.type}
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium border ${
                      statusStyles[lead.status] ?? statusStyles.Ignored
                    }`}
                  >
                    {lead.status}
                  </span>
                </div>
              </div>
              <span className="text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full text-sm whitespace-nowrap flex-shrink-0">
                {lead.budget}
              </span>
            </div>

            <p className="text-slate-600 text-sm whitespace-pre-wrap line-clamp-3">
              {lead.description}
            </p>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100 flex-wrap">
              <a
                href={lead.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                View Details
              </a>
              {lead.status === 'New' && (
                <button
                  onClick={() => updateStatus(lead.id, 'Pitched')}
                  className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors"
                >
                  Mark Pitched
                </button>
              )}
              {lead.status === 'Pitched' && (
                <button
                  onClick={() => updateStatus(lead.id, 'Closed')}
                  className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
                >
                  Mark Closed
                </button>
              )}
              {lead.status !== 'Ignored' && (
                <button
                  onClick={() => updateStatus(lead.id, 'Ignored')}
                  className="text-slate-500 hover:text-red-600 px-4 py-2 rounded-lg text-sm font-medium ml-auto transition-colors"
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}

        {leads.length === 0 && (
          <div className="text-center py-24 text-slate-400">
            <p className="text-lg font-medium mb-2">No leads yet</p>
            <p className="text-sm">Start your n8n workflows to populate the feed.</p>
          </div>
        )}
      </div>
    </main>
  );
}
