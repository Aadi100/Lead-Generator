// One-time: creates VAPID keys for Web Push. Public key -> app_settings.push.public_key (browser-readable),
// private key -> worker/.env (VAPID_PRIVATE_KEY). Never prints the private key. Existing keys are kept unless --force.
// Run: node scripts/gen-vapid.mjs [--force] [--subject mailto:you@example.com]
import fs from 'node:fs';
import * as webpush from 'web-push';

const force = process.argv.includes('--force');
const si = process.argv.indexOf('--subject');
const envPath = 'worker/.env';
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const set = (k, v) => { env = new RegExp(`^${k}=`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${env.replace(/\s*$/, '\n')}${k}=${v}\n`; };

let pub = get('VAPID_PUBLIC_KEY');
if (!get('VAPID_PRIVATE_KEY') || !pub || force) {
  const k = webpush.generateVAPIDKeys();
  set('VAPID_PUBLIC_KEY', k.publicKey); set('VAPID_PRIVATE_KEY', k.privateKey); pub = k.publicKey;
  console.log('generated new VAPID keys (existing phone subscriptions must be re-enabled if you used --force)');
}
if (!get('VAPID_SUBJECT') || si !== -1) set('VAPID_SUBJECT', si !== -1 ? process.argv[si + 1] : 'mailto:admin@mail.com');
fs.writeFileSync(envPath, env);

const url = (env.match(/^SUPABASE_URL=(.*)$/m) || [])[1]?.trim();
const key = (env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m) || [])[1]?.trim();
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const cur = await (await fetch(`${url}/rest/v1/app_settings?key=eq.push&select=value`, { headers: H })).json();
const value = { enabled: true, events: { new_lead: true, reply: true, task_due: true, send_failed: true }, ...(cur[0]?.value || {}), public_key: pub };
const r = await fetch(`${url}/rest/v1/app_settings`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'push', value, updated_at: new Date().toISOString() }) });
console.log(r.ok ? 'public key stored in app_settings.push' : `could not store public key: ${r.status}`);
