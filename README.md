# Lead Radar

A live dashboard of people who want a **website, app or design** made. n8n finds the posts, scores how trustworthy each one looks, and saves them to Supabase. The Next.js dashboard shows them in real time.

```
Reddit / Freelancer.com / Hacker News / We Work Remotely / contact form
                          |
                        n8n  (find, classify, extract budget + contact, score trust)
                          |
                   Supabase (PostgreSQL + Realtime + Auth)
                          |
                  Next.js dashboard (http://localhost:3000)
```

## Step 1. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor**, paste [supabase/schema.sql](supabase/schema.sql) and run it, then run [supabase/schema-v2.sql](supabase/schema-v2.sql) (website details, drafts, replies, settings).
3. **Authentication > Users > Add user**: create the email and password you will use to sign in.
4. **Settings > API**: copy the Project URL and the anon key.

## Step 2. Dashboard

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>

npm install
npm run dev        # http://localhost:3000
```

## Step 3. n8n

```bash
npm install n8n -g
n8n start          # http://localhost:5678
```

1. **Credentials > Create > Postgres**, name it `Supabase Leads DB`. Use the values from Supabase **Connect > Session pooler** (host `aws-0-<region>.pooler.supabase.com`, port `5432`, user `postgres.<project-ref>`, database `postgres`, SSL on).
2. **Workflows > Import from file**: import every file in [n8n/workflows/](n8n/workflows). Open any Postgres node and pick the `Supabase Leads DB` credential if it is not already selected.
3. Click **Publish** on each workflow that does not need a key.

Run `supabase/schema-v3.sql` as well (game trading columns and settings rows).

## Step 4. Worker (writing, sending, replies, alerts, trading, API-key sources)

The worker is a small program on your PC that does everything the dashboard cannot do safely in the browser. Keep it running.

```bash
# worker/.env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key, never share it>
DASHBOARD_URL=http://localhost:3000

npm run worker
```

It needs the Claude Code command line (`claude`) to be installed and signed in. It uses your Claude plan, so there is no API bill. Without it, drafts fall back to plain templates.

## Using it

Open **Settings** in the dashboard and fill in, in this order:

1. **Profile & links**: your name, websites and social links, then press **Learn from my links**. It reads them and builds your voice, services and keywords. Sites that need a login (LinkedIn, Instagram) are reported as unreadable, never guessed.
2. **Email sending**: SMTP or Resend, your from address, daily limit and follow-up days. Press **Send test email**.
3. **Reply tracking** (optional): IMAP details of the inbox that receives replies. It only reads, never changes your mailbox.
4. **Alerts** (optional): email or WhatsApp (CallMeBot) for new high-trust leads and replies.
5. **Local prospecting** (optional): cities and business types. It finds shops with no website on OpenStreetMap.

**Targeting** (Settings > Targeting) tells every source what you want: words and phrases to look for, project topics, words to skip, a smallest budget, and a plain description of your work and the jobs you want. Press **Suggest keywords from my descriptions** to get a starting list. The scrapers read these settings on every run, so changes apply within about 30 minutes with no restart. Posts that match only your own words show up under the category **Other**. Your words also raise a lead's **Best match** score and shape the pitch. Your skip words hide posts, and a budget below your minimum lowers the score without hiding the lead.

**Game trading** (Settings > Trading): list what you sell and what you want to buy (game, item type such as account, boosting or top-up, keywords, price limit). Lead Radar then finds buyers for what you sell and sellers for what you want in public Reddit trading communities. Each post is read for game, item, price and side, checked for scam signs (stolen accounts, pay first, no middleman) and matched to your list. **Suggest what I can sell** compares buyer and seller posts to show where demand beats supply. Selling accounts often breaks game publishers' rules; that risk is yours.

**Capture** (the Capture page) is for sites that cannot be read automatically: Eldorado, G2G, Z2U, FunPay, PlayerAuctions, forums. Drag the "Send to Lead Radar" bookmark to your bookmarks bar, open the page yourself, click it, review what it found, and save. Or paste text into the paste box.

**Connections** (Settings > Connections) is where the optional API keys go: Serper (Google search), X, the Reddit API, and Upwork alerts through your inbox. Each has a Test connection button. Alert email and WhatsApp details go in Settings > Alerts.

What happens next:

- **Enrichment.** Every lead gets its website checked for contact emails, phones, social links, owner name, platform and problems. Emails are checked for a mail server and marked valid, role (like info@), guessed or unusable.
- **Drafts.** The worker writes a first email and follow-ups for good leads, but never sends them. Leads without an email get a short message you paste into the DM or bid.
- **One-click send.** Open **Review & send** on a lead, edit the text, press **Send now**. Follow-ups go out on the days you set unless the person replies.
- **Replies.** Replies are matched to the lead, sorted (interested, question, not interested, out of office, bounce), the lead moves to **Replied**, follow-ups stop, and "no thanks" or bounced addresses go on the do-not-contact list.
- **Learning.** Your edits, thumbs and rewrite notes update the writing rules in Settings. Won, lost and ignored leads update the **Best match** score and the **Insights** page.

Safety rules the worker always enforces: nothing is sent unless you pressed Send; one **Pause everything** switch; a daily limit and a gap between emails; no second email to the same address; suspicious leads need your confirmation; unsafe text (placeholders, AI wording, links to sites you do not own) is held; manual messages are never sent by the worker.

## Sources

| Workflow | Where it looks | Key needed |
|---|---|---|
| Reddit - Hiring boards | r/forhire, slavelabour, DoneDirtCheap, DesignJobs, hiring, HungryArtists (every 10 min) | No |
| Reddit - Business communities | r/shopify, startups, Entrepreneur, smallbusiness, SideProject, SaaS, ecommerce, nocode, web_design, graphic_design, logodesign, Wordpress, webflow, woocommerce (every 20 min) | No |
| Freelancer.com - Client projects | Open projects for websites, apps, design, automation (every 30 min) | No |
| Hacker News - Who is hiring | Contract and part-time posts in the monthly thread (every 6 h) | No |
| We Work Remotely - Contract work | Contract postings in design and programming (every 3 h) | No |
| Inbound - Website contact form | `POST http://localhost:5678/webhook/lead-intake` with `projectName, name, email, details, budget` | No |
### Platform workflows (n8n, all published)

| Workflow | What it does |
|---|---|
| System - Heartbeat | Every 5 minutes writes `n8n_status.last_seen` so the dashboard can show that n8n is alive |
| System - Failure alerts | The error workflow of all the others. Records the last failure in `n8n_status` and posts it to your alert channels (Settings > Alerts, only when alerts are enabled; the same error is reported at most once an hour) |
| Daily summary | 08:00 (n8n's timezone): new leads, strong matches, trade matches, drafts, replies, tasks due, open deals, best three leads, sent to your alert channels |
| Reminders - Follow up and keep moving | Hourly: makes a task for every lead pitched 3+ days ago with no reply (and no email sequence running), and a high-priority task for every lead that replied 2+ days ago and went quiet |
| Capture - Send anything to Lead Radar | `POST http://localhost:5678/webhook/capture` with `{"text": "...", "url": "...", "kind": "trade"}` or `{"items": [...]}`. The worker reads it like the Capture page, so a phone shortcut or another tool can send leads in |

### More worker sources (added later)

| Source | Where it looks | Key needed | Status |
|---|---|---|---|
| Indie Hackers | Posts asking for developers or designers, found with Google search through Serper (indiehackers.com blocks direct reading: Cloudflare returns 403 and there is no public feed) | Serper | Needs key |
| Product Hunt prospects | New launches from the public Atom feed (works with no key); an optional developer token (Connections) also checks each product's website. These are **Outbound prospects**, not buyers | Optional token | Works today |
| LinkedIn jobs and posts | `site:linkedin.com/jobs` and `site:linkedin.com/posts` Google queries through Serper using your Targeting keywords. LinkedIn is never fetched directly | Serper | Needs key |
| Upwork | Your saved-search alert emails read from your inbox (no scraping, no API approval needed) | Inbox (IMAP) | Needs inbox |
| Fiverr requests | Fiverr buyer requests are logged-in only, so they are not fetched. Public "looking for a freelancer" posts are found through Serper. Open a request in your own browser and use the **Capture** bookmark (it now reads Fiverr and Upwork pages) to add real ones | Serper (discovery only) | Needs key |
| Google Places prospects | Optional: Serper `places` search for your cities and niches (Settings > Prospecting), keeping businesses with no or a broken website. Google Maps itself is never scraped; OpenStreetMap prospecting stays the free default | Serper | Needs key |

Each one has a Run now button on the Sources page and a switch in Settings > Connections (Prospecting for Places). They run on staggered schedules (3 h to 24 h) and show "Needs key" until the key exists.

### Sources that need keys now live in the worker

Google search (Serper), X, the Reddit API and Upwork alerts are configured in the dashboard under **Settings > Connections**, not in n8n. The old `[KEY]` n8n workflows were replaced by those worker sources and renamed `ZZ Replaced - delete me` in n8n. You can delete them there.

## How the trust score works

Each lead starts at 50. Points are added for a stated budget, a contact method, a website or email, a detailed description, a timeline, and a clear category. Points are removed for warning signs: asking the freelancer to pay first, bank or ID requests, unpaid or exposure-only work, shortened links, disposable emails, Telegram-only contact, all-caps urgency, unrealistic budgets, and (with an API key) brand-new or zero-karma accounts.

Levels: 70+ High, 45-69 Medium, below 45 Low. A lead is marked **suspicious** when it has a serious flag, two medium flags, or a score under 35. Suspicious leads are still saved. The dashboard highlights them and lists the reasons.

## Limits to know

- Without API keys, Reddit leads are scored on the post text only. Account age and karma are checked only by the Reddit API source (Settings > Connections).
- Freelancer.com hides the client's identity, so those leads are scored on the project, not the person.
- Reddit rate-limits unauthenticated feeds. Do not shorten the schedules below the defaults.
- n8n runs on your PC, so the scraping only happens while it is running, and a public website cannot reach `localhost` webhooks without a tunnel or a server.
