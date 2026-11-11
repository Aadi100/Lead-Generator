"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { useJob } from '@/lib/jobs';
import { loadSettings, useSettingForm } from '@/lib/settings';
import { fmtDateTime } from '@/lib/format';
import type { IntegrationName, IntegrationStatus, IntegrationsSettings } from '@/lib/types';
import { useShell } from '../AppShell';
import { Card, Field, Notice, Spinner, Toggle, btnSecondary, inputCls, pill } from '../ui';
import SaveBar from './SettingsSaveBar';
import SecretInput from './SecretInput';
import { ResultChip } from './StatusChip';
import Link from 'next/link';

const OWNED: (keyof IntegrationsSettings)[] = ['serper', 'x', 'reddit_api', 'discord', 'upwork_inbox'];

type Chip = { label: string; tone: string; title?: string };

function chipFor(enabled: boolean | null, hasKey: boolean, status: IntegrationStatus | undefined, keyWord: string): Chip {
  if (enabled === false) return { label: 'Off', tone: 'bg-surface-2 text-fg-muted ring-border' };
  if (!hasKey) return { label: keyWord, tone: 'bg-warning-soft text-warning ring-warning-border' };
  if (status) {
    return status.ok
      ? { label: 'Ready', tone: 'bg-success-soft text-success ring-success-border', title: status.checked_at ? `Checked ${fmtDateTime(status.checked_at)}` : undefined }
      : { label: 'Problem', tone: 'bg-danger-soft text-danger ring-danger-border', title: status.message };
  }
  return { label: 'Not tested yet', tone: 'bg-surface-2 text-fg-muted ring-border' };
}

function Section({
  id,
  name,
  title,
  what,
  steps,
  enabled,
  onToggle,
  hasKey,
  keyWord = 'Needs setup',
  status,
  beforeTest,
  onTested,
  children,
}: {
  id: string;
  name: IntegrationName;
  title: string;
  what: string;
  steps: ReactNode[];
  enabled: boolean | null;
  onToggle?: (v: boolean) => void;
  hasKey: boolean;
  keyWord?: string;
  status: IntegrationStatus | undefined;
  beforeTest: () => Promise<boolean>;
  onTested: () => Promise<void>;
  children?: ReactNode;
}) {
  const run = useJob();
  const chip = chipFor(enabled, hasKey, status, keyWord);

  const test = async () => {
    if (!(await beforeTest())) return;
    await run.start('test_integration', { name });
    await onTested();
  };

  const ok = run.phase === 'done' && run.result?.ok === true;
  const bad = run.phase === 'done' && run.result?.ok !== true;
  const message = typeof run.result?.message === 'string' ? run.result.message : '';

  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-border pt-5 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`${id}-title`} className="text-sm font-semibold text-fg">
          {title}
        </h3>
        <span className={`${pill} ${chip.tone}`} title={chip.title}>
          {chip.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-fg-muted">{what}</p>

      {enabled !== null && onToggle && (
        <div className="mt-3">
          <Toggle id={`${id}-on`} checked={enabled} onChange={onToggle} label={`Use ${title}`} />
        </div>
      )}

      {children && <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-primary-text">Where do I get this?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-fg-subtle">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void test()} disabled={run.running || !hasKey} className={btnSecondary}>
          {run.running && <Spinner />}
          Test connection
        </button>
        {run.running && <ResultChip state="running" />}
        {ok && <ResultChip state="ok" message={message || 'Works.'} />}
        {bad && <ResultChip state="bad" message={message || 'The test did not pass.'} />}
        {(run.phase === 'failed' || run.phase === 'timeout') && <ResultChip state="bad" message={run.error ?? 'The test did not finish.'} />}
        {!hasKey && <span className="text-xs text-fg-subtle">Add the details first.</span>}
      </div>
    </section>
  );
}

type Other = { label: string; ready: boolean; note: string; tab: string };

export default function ConnectionsTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('integrations', OWNED);
  const [others, setOthers] = useState<Other[] | null>(null);
  const [inboxReady, setInboxReady] = useState(false);
  const c = form.draft;
  const st = form.saved.status;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { values, error } = await loadSettings(['sending', 'smtp', 'resend', 'imap', 'alerts']);
      if (cancelled || error) return;
      const { sending, smtp, resend, imap, alerts } = values;
      const emailReady = sending.from_email.trim() !== '' && ((sending.provider === 'smtp' && smtp.host.trim() !== '') || (sending.provider === 'resend' && resend.api_key.trim() !== ''));
      const inbox = imap.enabled && imap.host.trim() !== '' && imap.user.trim() !== '' && imap.pass.trim() !== '';
      const alertsReady = !!(alerts.discord.webhook_url || alerts.email.to || (alerts.telegram.bot_token && alerts.telegram.chat_id) || (alerts.whatsapp.phone && alerts.whatsapp.apikey));
      setInboxReady(inbox);
      setOthers([
        { label: 'Email sending (SMTP or Resend)', ready: emailReady, note: 'Needed to send pitches with one click.', tab: 'email' },
        { label: 'Inbox for replies (IMAP)', ready: inbox, note: 'Lets me spot replies. Also used for Upwork alert emails.', tab: 'imap' },
        { label: 'Alerts (Discord webhook, email, WhatsApp, Telegram)', ready: alertsReady, note: 'Where I send you a message when a strong lead arrives.', tab: 'alerts' },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (): Promise<boolean> => {
    const err = await form.save();
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'Connections saved.');
    return true;
  };

  const beforeTest = async () => (form.dirty ? save() : true);
  const afterTest = async () => {
    await form.reload();
  };
  const common = { beforeTest, onTested: afterTest };

  return (
    <div className="space-y-4">
      <Card
        title="Connections and API keys"
        subtitle="Some sources need a key from the service. Paste it here, switch the source on, and press Test connection. Nothing runs until you do."
      >
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-5">
            <Notice tone="warn">
              Telegram is blocked on some networks, including yours when I tested. For that reason I do not use Telegram as a source, and Telegram alerts may fail.
              If the Telegram test fails, use the Discord webhook or email in the Alerts tab instead.
            </Notice>

            <Section
              id="cn-serper"
              name="serper"
              title="Google search (Serper)"
              what="Finds public posts on LinkedIn, X, Facebook groups, Reddit and other sites through Google, for web, app and design work, and for game trading."
              enabled={c.serper.enabled}
              onToggle={(v) => form.patch({ serper: { ...c.serper, enabled: v } })}
              hasKey={c.serper.api_key.trim() !== ''}
              status={st.serper}
              steps={[
                'Go to serper.dev and create a free account. Some free searches are included, more are paid.',
                'Open the dashboard and copy your API key.',
                'Paste it here, switch the source on, and press Test connection.',
              ]}
              {...common}
            >
              <Field label="Serper API key" htmlFor="cn-serper-key">
                <SecretInput
                  id="cn-serper-key"
                  autoComplete="off"
                  value={c.serper.api_key}
                  onChange={(e) => form.patch({ serper: { ...c.serper, api_key: e.target.value.trim() } })}
                />
              </Field>
              <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
                <Toggle id="cn-serper-svc" checked={c.serper.services} onChange={(v) => form.patch({ serper: { ...c.serper, services: v } })} label="Look for web, app and design work" />
                <Toggle id="cn-serper-trd" checked={c.serper.trading} onChange={(v) => form.patch({ serper: { ...c.serper, trading: v } })} label="Look for game trading posts" />
              </div>
            </Section>

            <Section
              id="cn-x"
              name="x"
              title="X (Twitter)"
              what="Finds people on X who ask for a developer, designer or game items. It also checks how old the account is and how many followers it has."
              enabled={c.x.enabled}
              onToggle={(v) => form.patch({ x: { ...c.x, enabled: v } })}
              hasKey={c.x.bearer_token.trim() !== ''}
              status={st.x}
              steps={[
                'Go to developer.x.com and sign in.',
                'Create a project and an app. Search needs a paid plan, the free plan does not include it.',
                'Open the app, find Keys and tokens, and copy the Bearer Token.',
                'Paste it here without the word Bearer.',
              ]}
              {...common}
            >
              <Field label="Bearer token" htmlFor="cn-x-token">
                <SecretInput
                  id="cn-x-token"
                  autoComplete="off"
                  value={c.x.bearer_token}
                  onChange={(e) => form.patch({ x: { ...c.x, bearer_token: e.target.value.trim().replace(/^Bearer\s+/i, '') } })}
                />
              </Field>
            </Section>

            <Section
              id="cn-reddit"
              name="reddit_api"
              title="Reddit API"
              what="Searches all of Reddit, not just a few communities, and checks how old each poster's account is and how much karma it has. It helps spot fake posts."
              enabled={c.reddit_api.enabled}
              onToggle={(v) => form.patch({ reddit_api: { ...c.reddit_api, enabled: v } })}
              hasKey={c.reddit_api.client_id.trim() !== '' && c.reddit_api.client_secret.trim() !== ''}
              status={st.reddit_api}
              steps={[
                'Sign in to Reddit and open reddit.com/prefs/apps.',
                'Press "create another app". Choose the type "script". For the redirect address type http://localhost.',
                'The client ID is the short code under the app name. The secret is the long code next to "secret".',
                'Type your Reddit username in the last box.',
              ]}
              {...common}
            >
              <Field label="Client ID" htmlFor="cn-rd-id">
                <input id="cn-rd-id" autoComplete="off" className={inputCls} value={c.reddit_api.client_id} onChange={(e) => form.patch({ reddit_api: { ...c.reddit_api, client_id: e.target.value.trim() } })} />
              </Field>
              <Field label="Client secret" htmlFor="cn-rd-secret">
                <SecretInput
                  id="cn-rd-secret"
                  autoComplete="off"
                  value={c.reddit_api.client_secret}
                  onChange={(e) => form.patch({ reddit_api: { ...c.reddit_api, client_secret: e.target.value.trim() } })}
                />
              </Field>
              <Field label="Your Reddit username" htmlFor="cn-rd-user" hint="Reddit asks for it so it knows who is using the key.">
                <input id="cn-rd-user" className={inputCls} value={c.reddit_api.username} onChange={(e) => form.patch({ reddit_api: { ...c.reddit_api, username: e.target.value.trim().replace(/^u\//i, '') } })} />
              </Field>
            </Section>

            <Section
              id="cn-discord"
              name="discord"
              title="Discord bot"
              what="Reads trading channels in Discord servers where you added your own bot. It cannot read servers it is not in, and it never posts anything."
              enabled={null}
              hasKey={c.discord.bot_token.trim() !== ''}
              status={st.discord}
              steps={[
                'Go to discord.com/developers/applications and press New Application.',
                'Open Bot in the left menu, press Reset Token, and copy the token. Paste it here.',
                'On the same page, turn on Message Content Intent and save.',
                'Open OAuth2, then URL Generator. Tick "bot", then View Channels and Read Message History. Open the link it makes and add the bot to a server you are allowed to add bots to.',
                'Then open the Game Trading catalog, turn on Discord, and add the channel IDs.',
              ]}
              {...common}
            >
              <Field label="Bot token" htmlFor="cn-dc-token" hint="Choose which channels to read in the Game Trading catalog.">
                <SecretInput
                  id="cn-dc-token"
                  autoComplete="off"
                  value={c.discord.bot_token}
                  onChange={(e) => form.patch({ discord: { ...c.discord, bot_token: e.target.value.trim() } })}
                />
              </Field>
            </Section>

            <Section
              id="cn-upwork"
              name="upwork_inbox"
              title="Upwork alerts from my inbox"
              what="Reads the job alert emails Upwork sends you and turns them into leads. It only reads. It never changes or deletes your emails."
              enabled={c.upwork_inbox.enabled}
              onToggle={(v) => form.patch({ upwork_inbox: { ...c.upwork_inbox, enabled: v } })}
              hasKey={inboxReady}
              keyWord="Needs setup"
              status={st.upwork_inbox}
              steps={[
                'On Upwork, save a search for each kind of work you want and turn on email alerts for it.',
                'Set up the inbox that receives those emails in the Reply tracking tab (no extra key is needed).',
                'Switch this on and press Test connection.',
              ]}
              {...common}
            >
              {!inboxReady && (
                <div className="sm:col-span-2">
                  <Notice tone="info">
                    No key is needed here, but I need to read your inbox first. Fill in the <Link href="/settings?tab=imap" className="font-semibold underline">Reply tracking</Link> tab.
                  </Notice>
                </div>
              )}
            </Section>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      <Card title="Keys that live in other tabs" subtitle="These are set up elsewhere in Settings. Here is where they stand.">
        {others === null ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <ul className="divide-y divide-border">
            {others.map((o) => (
              <li key={o.tab} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className={`${pill} ${o.ready ? 'bg-success-soft text-success ring-success-border' : 'bg-warning-soft text-warning ring-warning-border'}`}>
                  {o.ready ? 'Ready' : 'Needs setup'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-fg">{o.label}</p>
                  <p className="text-xs text-fg-subtle">{o.note}</p>
                </div>
                <Link href={`/settings?tab=${o.tab}`} className="text-sm font-semibold text-primary-text hover:underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
