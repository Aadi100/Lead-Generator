#!/usr/bin/env bash
# =====================================================================================================
# Lead Radar: install or update on a plain Ubuntu / Debian server. No Docker.
#
# WHAT YOU GET
#   <APP_NAME>-web.service     the website (Next.js), listens on 127.0.0.1:PORT (or all addresses without a domain)
#   <APP_NAME>-worker.service  the background helper (writes with the AI, sends email, reads replies, alerts)
#   n8n.service                ONE shared n8n for all your projects (installed globally only if it is missing)
#   nginx site + HTTPS         only when you give a DOMAIN
# The database is Supabase (hosted online), so nothing is installed for it and there are no backup files.
# The scripts never: upgrade system packages, restart nginx (reload only), touch other nginx sites,
# change the firewall (unless ENABLE_FIREWALL=1), or pick another port / folder / name by themselves.
#
# BEFORE YOU START
#   1. A server with Ubuntu 22.04+ or Debian 12+, and root (or sudo) access.
#   2. Your Supabase values (Supabase > Project Settings > API):  project URL, anon key, service role key.
#      The SQL files in supabase/ must already have been run once in Supabase.
#   3. Your push keys (VAPID) from your own computer's worker/.env, so phone notifications keep working.
#      The public key is already saved in your database, so do NOT make new keys on the server.
#   4. Optional: a domain name pointing at the server's IP address (for HTTPS).
#
# PACK AND UPLOAD (run on YOUR computer, inside the project folder; nothing secret is included)
#   tar --exclude='.git' --exclude='.env' --exclude='.env.*' --exclude='worker/.env' --exclude='.dev-tools' \
#       --exclude='node_modules' --exclude='.next' --exclude='*.tsbuildinfo' --exclude='*.log' --exclude='*.pem' \
#       -czf lead-radar.tar.gz .
#   scp lead-radar.tar.gz root@SERVER_IP:/root/
#   Then on the server:   mkdir -p /root/lead-radar-src && tar -xzf /root/lead-radar.tar.gz -C /root/lead-radar-src
#
# FIRST INSTALL (on the server)
#   cd /root/lead-radar-src
#   sudo SUPABASE_URL='https://xxxx.supabase.co' SUPABASE_ANON_KEY='...' SUPABASE_SERVICE_ROLE_KEY='...' \
#        VAPID_PUBLIC_KEY='...' VAPID_PRIVATE_KEY='...' VAPID_SUBJECT='mailto:you@example.com' \
#        DOMAIN='leads.example.com' LE_EMAIL='you@example.com' \
#        bash deploy/setup_vps.sh
#   Without DOMAIN the dashboard is on http://SERVER_IP:PORT (plain http; the phone app and push need https).
#   The keys are written once into /opt/<APP_NAME>/.env (private, mode 600). Later runs never overwrite it.
#
# n8n (shared)
#   If n8n is not on the server, it is installed globally. If it is already there, it is left exactly as it is.
#   Your 11 workflows are imported only when their ID is not in n8n yet (nothing of other projects is changed).
#   n8n listens only on the server itself. To open the editor from your computer:
#       ssh -L 5678:127.0.0.1:5678 root@SERVER_IP      then open http://localhost:5678
#   Or give N8N_DOMAIN to get a public address with HTTPS (needed for webhooks from the internet).
#   The workflows need the Postgres login "Supabase Leads DB". Two ways to add it:
#     a) in the n8n editor: Credentials > Create > Postgres (see README, Step 3), then press Publish on each workflow; or
#     b) on your computer: n8n export:credentials --all --decrypted --output=creds.json
#        upload it and pass  N8N_CREDENTIALS_FILE=/root/creds.json  to this script, then DELETE the file.
#   Workflows that could not be switched on say so at the end.
#
# ADD A DOMAIN LATER
#   Run the first-install command again with DOMAIN (and LE_EMAIL). The .env keeps your keys; only the
#   address settings (HOST, DASHBOARD_URL) are updated. Point the domain's DNS at the server first.
#
# A SECOND APP ON THE SAME SERVER
#   Give it its own name and port:   sudo APP_NAME=other PORT=3100 DOMAIN=other.example.com bash deploy/setup_vps.sh
#   Everything (folder, user, services, nginx site) is named after APP_NAME. n8n stays shared.
#
# UPDATE
#   Upload the new code (the tar steps above) and run:   sudo bash deploy/update.sh
#   Or from a git checkout on the server:                  git pull && sudo bash deploy/update.sh
#   Another app:                                           sudo APP_NAME=other bash deploy/update.sh
#   An update keeps .env and the data, rebuilds, and restarts only this app's web and worker.
#
# PREVIEW (changes nothing, needs no root): writes the service and nginx files into a folder so you can read them
#   bash deploy/setup_vps.sh --preview /tmp/preview
#
# SETTINGS (put them in front of the command; all have defaults)
#   APP_NAME                  default lead-radar      letters, digits and - only. Names everything below.
#   APP_USER                  default = APP_NAME in lowercase     the Linux user the app runs as
#   APP_DIR                   default /opt/<APP_NAME>
#   PORT                      default 3000            the website's port (kept on 127.0.0.1 when DOMAIN is set)
#   DOMAIN                    default empty           adds the nginx site and HTTPS (certbot)
#   PUBLIC_HOST               default = the server's IP address   used for the http://IP:PORT address
#   LE_EMAIL                  default empty           email for Let's Encrypt notices
#   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY     required on the first install
#   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT              push keys (push stays off without them)
#   ENABLE_FIREWALL           default 0               1 = set up ufw (SSH, 80, 443 and PORT when there is no domain)
#   SSH_PORT                  default 22              only used with ENABLE_FIREWALL=1
#   SKIP_N8N                  default 0               1 = do not touch n8n at all
#   N8N_PORT                  default 5678            N8N_DOMAIN default empty (public address for n8n)
#   N8N_USER                  default n8n             N8N_DATA default /var/lib/n8n    N8N_TIMEZONE default Etc/UTC
#   N8N_CREDENTIALS_FILE      default empty           decrypted credentials export to import (see above)
#
# EVERYDAY COMMANDS  (replace lead-radar with your APP_NAME)
#   systemctl status lead-radar-web lead-radar-worker n8n
#   systemctl restart lead-radar-web          (website only)      systemctl restart lead-radar-worker   (helper only)
#   journalctl -u lead-radar-web -f           journalctl -u lead-radar-worker -f           journalctl -u n8n -f
#   nano /opt/lead-radar/.env  then  systemctl restart lead-radar-web lead-radar-worker     (change a key)
#   If you see "\r: command not found", the files have Windows line endings. Fix:  sed -i 's/\r$//' deploy/*
# =====================================================================================================
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SELF_DIR/.." && pwd)"

say()  { echo "==> $*"; }
warn() { echo "!!  $*" >&2; WARNINGS+=("$*"); }
die()  { echo "STOPPED: $*" >&2; exit 1; }
WARNINGS=()
DID=()

# ---------- arguments ----------
MODE=install
PREVIEW_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --update)  MODE=update ;;
    --preview) MODE=preview; PREVIEW_DIR="${2:-}"; [ -n "$PREVIEW_DIR" ] || die "--preview needs a folder, for example: --preview /tmp/preview"; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
    *) die "Unknown option: $1 (use --update, --preview <folder> or --help)" ;;
  esac
  shift
done

# ---------- settings ----------
APP_NAME="${APP_NAME:-lead-radar}"
APP_USER="${APP_USER:-$(printf '%s' "$APP_NAME" | tr 'A-Z' 'a-z')}"
APP_DIR="${APP_DIR:-/opt/$APP_NAME}"
PORT_GIVEN="${PORT:-}"
PORT="${PORT:-3000}"
DOMAIN="${DOMAIN:-}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
LE_EMAIL="${LE_EMAIL:-}"
ENABLE_FIREWALL="${ENABLE_FIREWALL:-0}"
SSH_PORT="${SSH_PORT:-22}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}"
VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-}"
VAPID_SUBJECT="${VAPID_SUBJECT:-}"
SKIP_N8N="${SKIP_N8N:-0}"
N8N_PORT="${N8N_PORT:-5678}"
N8N_DOMAIN="${N8N_DOMAIN:-}"
N8N_USER="${N8N_USER:-n8n}"
N8N_DATA="${N8N_DATA:-/var/lib/n8n}"
N8N_TIMEZONE="${N8N_TIMEZONE:-Etc/UTC}"
N8N_CREDENTIALS_FILE="${N8N_CREDENTIALS_FILE:-}"

MARKER="$APP_DIR/.deployed-by-setup_vps"

# ---------- check the settings ----------
[[ "$APP_NAME" =~ ^[A-Za-z0-9-]+$ ]]            || die "APP_NAME may only have letters, digits and - (you gave: $APP_NAME)"
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]   || die "APP_USER must be a simple lowercase Linux name (you gave: $APP_USER)"
[[ "$APP_DIR" =~ ^/[A-Za-z0-9._/-]+$ && "$APP_DIR" != "/" ]] || die "APP_DIR must be a plain absolute folder such as /opt/lead-radar (you gave: $APP_DIR)"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "PORT must be a number from 1 to 65535 (you gave: $PORT)"
[[ "$N8N_PORT" =~ ^[0-9]+$ ]] && [ "$N8N_PORT" -ge 1 ] && [ "$N8N_PORT" -le 65535 ] || die "N8N_PORT must be a number from 1 to 65535"
[[ "$SSH_PORT" =~ ^[0-9]+$ ]]                   || die "SSH_PORT must be a number"
[[ -z "$DOMAIN" || "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "DOMAIN looks wrong: $DOMAIN"
[[ -z "$N8N_DOMAIN" || "$N8N_DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "N8N_DOMAIN looks wrong: $N8N_DOMAIN"
[[ "$N8N_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]   || die "N8N_USER must be a simple lowercase Linux name"
[[ "$N8N_DATA" =~ ^/[A-Za-z0-9._/-]+$ ]]        || die "N8N_DATA must be a plain absolute folder"
[[ "$N8N_TIMEZONE" =~ ^[A-Za-z0-9_/+-]+$ ]]     || die "N8N_TIMEZONE looks wrong (example: Asia/Karachi)"
[[ -z "$LE_EMAIL" || "$LE_EMAIL" =~ ^[^[:space:]@\'\"]+@[^[:space:]@\'\"]+$ ]] || die "LE_EMAIL looks wrong"
for v in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
  case "${!v}" in *\'*|*$'\n'*|*$'\r'*) die "$v must not contain a quote or a line break" ;; esac
done

# ---------- helpers ----------
NODE_BIN="$(command -v node 2>/dev/null || true)"; NODE_BIN="${NODE_BIN:-/usr/bin/node}"
N8N_BIN="$(command -v n8n 2>/dev/null || true)";   N8N_BIN="${N8N_BIN:-/usr/bin/n8n}"

# Fill the @@PLACEHOLDERS@@ of a template and write the result.
render() {
  sed -e "s|@@APP_NAME@@|$APP_NAME|g" -e "s|@@APP_USER@@|$APP_USER|g" -e "s|@@APP_DIR@@|$APP_DIR|g" \
      -e "s|@@PORT@@|$PORT|g" -e "s|@@DOMAIN@@|${DOMAIN:-app.example.com}|g" -e "s|@@NODE_BIN@@|$NODE_BIN|g" \
      -e "s|@@N8N_USER@@|$N8N_USER|g" -e "s|@@N8N_DATA@@|$N8N_DATA|g" -e "s|@@N8N_PORT@@|$N8N_PORT|g" \
      -e "s|@@N8N_TIMEZONE@@|$N8N_TIMEZONE|g" -e "s|@@N8N_BIN@@|$N8N_BIN|g" -e "s|@@N8N_DOMAIN@@|${N8N_DOMAIN:-n8n.example.com}|g" \
      "$1" > "$2"
}

# ---------- preview: write the files, change nothing ----------
if [ "$MODE" = preview ]; then
  # The preview shows the usual server paths, not the ones on the computer you run it on.
  case "$NODE_BIN" in /usr/*) ;; *) NODE_BIN=/usr/bin/node ;; esac
  case "$N8N_BIN" in /usr/*) ;; *) N8N_BIN=/usr/bin/n8n ;; esac
  mkdir -p "$PREVIEW_DIR"
  render "$SELF_DIR/web.service"      "$PREVIEW_DIR/$APP_NAME-web.service"
  render "$SELF_DIR/worker.service"   "$PREVIEW_DIR/$APP_NAME-worker.service"
  render "$SELF_DIR/n8n.service"      "$PREVIEW_DIR/n8n.service"
  render "$SELF_DIR/nginx.conf"       "$PREVIEW_DIR/$APP_NAME.nginx.conf"
  render "$SELF_DIR/n8n.nginx.conf"   "$PREVIEW_DIR/n8n.nginx.conf"
  say "Preview written to $PREVIEW_DIR (nothing was installed or changed):"
  ls -1 "$PREVIEW_DIR"
  [ -n "$DOMAIN" ] || echo "(No DOMAIN given, so the nginx files show the placeholder app.example.com.)"
  exit 0
fi

[ "$(id -u)" -eq 0 ] || die "Run this as root, for example: sudo bash deploy/setup_vps.sh"
command -v apt-get >/dev/null 2>&1 || die "This script is for Ubuntu or Debian (apt-get was not found)."
command -v systemctl >/dev/null 2>&1 || die "systemd was not found. This script needs systemd."
export DEBIAN_FRONTEND=noninteractive

port_in_use() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
installed() { [ -f "$MARKER" ]; }

if [ "$MODE" = update ]; then
  installed || die "$APP_NAME is not installed in $APP_DIR yet. Run the first install (without --update) first."
fi

# Update keeps the port the app already uses, unless you pass PORT again.
if installed && [ -f "$APP_DIR/.env" ] && [ -z "$PORT_GIVEN" ]; then
  P="$(grep -E "^PORT=" "$APP_DIR/.env" | tail -n1 | sed -E "s/^PORT='?([0-9]+)'?.*/\1/")" || true
  [ -n "${P:-}" ] && PORT="$P"
fi
# Update keeps the domain it already has, unless you pass DOMAIN.
UPDATE_KEEP_DOMAIN=0
if [ "$MODE" = update ] && [ -z "$DOMAIN" ]; then UPDATE_KEEP_DOMAIN=1; fi

# ---------- stop early when something is already taken ----------
if ! installed; then
  say "Checking that nothing is already using the names this app needs"
  [ ! -e "$APP_DIR" ] || [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ] || die "The folder $APP_DIR already exists and was not made by this script. Pick another APP_NAME or APP_DIR."
  ! id "$APP_USER" >/dev/null 2>&1 || die "A Linux user named $APP_USER already exists (it may belong to another app). Pick another APP_NAME or APP_USER."
  [ ! -e "/etc/systemd/system/$APP_NAME-web.service" ] || die "A service called $APP_NAME-web already exists. Pick another APP_NAME."
  [ ! -e "/etc/nginx/sites-available/$APP_NAME" ] || die "An nginx site called $APP_NAME already exists. Pick another APP_NAME."
  ! port_in_use "$PORT" || die "Port $PORT is already in use by something else. Pick another PORT, for example PORT=3100."
  [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_ANON_KEY" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] \
    || die "Missing Supabase values. Pass SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see the top of this file)."
fi
if [ -n "$DOMAIN" ]; then
  # Another site on this server must not already answer for the domain.
  other="$(grep -RlsE "server_name[^;]*[[:space:]]${DOMAIN//./\\.}([[:space:];]|\$)" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -v "/$APP_NAME\$" | head -n1 || true)"
  [ -z "$other" ] || die "The domain $DOMAIN is already used by another nginx site ($other). Use a different DOMAIN."
  if [ -e "/etc/nginx/sites-available/$APP_NAME" ] && ! grep -qE "server_name[[:space:]]+${DOMAIN//./\\.}[[:space:];]" "/etc/nginx/sites-available/$APP_NAME"; then
    die "The nginx site $APP_NAME already exists for a different domain. Remove it yourself first if you want to change the domain."
  fi
fi
if [ "$SKIP_N8N" != 1 ] && [ ! -e /etc/systemd/system/n8n.service ] && port_in_use "$N8N_PORT"; then
  die "Port $N8N_PORT is already in use and there is no n8n service from this script. If n8n already runs here, add SKIP_N8N=1. Otherwise pick another N8N_PORT."
fi

# ---------- packages (only what is missing, no upgrades) ----------
need=()
for pair in nginx:nginx curl:curl rsync:rsync; do
  command -v "${pair%%:*}" >/dev/null 2>&1 || need+=("${pair##*:}")
done
command -v runuser >/dev/null 2>&1 || need+=(util-linux)
command -v ss >/dev/null 2>&1 || need+=(iproute2)
{ [ -n "$DOMAIN" ] || [ -n "$N8N_DOMAIN" ]; } && ! command -v certbot >/dev/null 2>&1 && need+=(certbot python3-certbot-nginx)
[ "$ENABLE_FIREWALL" = 1 ] && ! command -v ufw >/dev/null 2>&1 && need+=(ufw)
if [ "${#need[@]}" -gt 0 ]; then
  say "Installing missing system packages: ${need[*]}"
  apt-get update -y -qq
  apt-get install -y -qq --no-install-recommends ca-certificates "${need[@]}"
  DID+=("installed packages: ${need[*]}")
fi

# ---------- Node.js (never upgraded) ----------
if ! command -v node >/dev/null 2>&1; then
  say "Node.js is not installed. Installing Node 22 from NodeSource."
  apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
  NODE_BIN="$(command -v node)"
  DID+=("installed Node.js $(node -v)")
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $(node -v) is too old (need 20 or newer, 22 is best). It is not upgraded here because other apps may use it."
case "$NODE_BIN" in /root/*|/home/*) die "Node.js is installed inside a user's home ($NODE_BIN), so the app user cannot run it. Install Node system-wide." ;; esac

# ---------- user and folder ----------
if ! id "$APP_USER" >/dev/null 2>&1; then
  say "Creating the Linux user $APP_USER"
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"
if ! installed; then date -u +%FT%TZ > "$MARKER"; chown "$APP_USER:$APP_USER" "$MARKER"; fi

# ---------- code ----------
if [ "$(cd "$SRC_DIR" && pwd -P)" != "$(cd "$APP_DIR" && pwd -P)" ]; then
  say "Copying the code to $APP_DIR (your .env and node_modules stay as they are)"
  rsync -a --delete \
    --exclude='.git/' --exclude='.env' --exclude='.env.*' --exclude='worker/.env' --exclude='.dev-tools/' \
    --exclude='node_modules/' --exclude='.next/' --exclude='*.tsbuildinfo' --exclude='.deployed-by-setup_vps' --exclude='.npm/' \
    "$SRC_DIR"/ "$APP_DIR"/
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  DID+=("copied the new code")
fi
[ -f "$APP_DIR/package.json" ] || die "No package.json in $APP_DIR. Run this script from the project folder."

as_app() { runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm_config_cache="$APP_DIR/.npm" "$@"; }

say "Installing the app's packages (npm ci)"
as_app bash -c 'cd "$1" && npm ci --no-audit --no-fund' _ "$APP_DIR"
DID+=("installed packages with npm ci")

# ---------- .env (written once, never overwritten) ----------
set_env_key() { # key value  (only for the address settings this script manages)
  local tmp; tmp="$(mktemp)"
  grep -v "^$1=" "$APP_DIR/.env" > "$tmp" || true
  printf "%s='%s'\n" "$1" "$2" >> "$tmp"
  cat "$tmp" > "$APP_DIR/.env"; rm -f "$tmp"
}

if [ -z "$PUBLIC_HOST" ]; then
  PUBLIC_HOST="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')" || true
  PUBLIC_HOST="${PUBLIC_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
  PUBLIC_HOST="${PUBLIC_HOST:-SERVER_IP}"
fi
if [ -n "$DOMAIN" ]; then WANT_HOST="127.0.0.1"; WANT_URL="https://$DOMAIN"; else WANT_HOST="0.0.0.0"; WANT_URL="http://$PUBLIC_HOST:$PORT"; fi

if [ ! -f "$APP_DIR/.env" ]; then
  say "Writing $APP_DIR/.env (private, mode 600). It is never overwritten on updates."
  subject="$VAPID_SUBJECT"
  [ -n "$subject" ] || { [ -n "$LE_EMAIL" ] && subject="mailto:$LE_EMAIL" || subject="mailto:you@example.com"; }
  ( umask 077
    {
      echo "# Written once by setup_vps.sh. Edit it by hand, then restart the services."
      echo "PORT='$PORT'"
      echo "HOST='$WANT_HOST'"
      echo "DASHBOARD_URL='$WANT_URL'"
      echo "NEXT_PUBLIC_SUPABASE_URL='$SUPABASE_URL'"
      echo "NEXT_PUBLIC_SUPABASE_ANON_KEY='$SUPABASE_ANON_KEY'"
      echo "SUPABASE_URL='$SUPABASE_URL'"
      echo "SUPABASE_SERVICE_ROLE_KEY='$SUPABASE_SERVICE_ROLE_KEY'"
      echo "VAPID_PUBLIC_KEY='$VAPID_PUBLIC_KEY'"
      echo "VAPID_PRIVATE_KEY='$VAPID_PRIVATE_KEY'"
      echo "VAPID_SUBJECT='$subject'"
    } > "$APP_DIR/.env" )
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"
  DID+=("created .env")
  { [ -n "$VAPID_PUBLIC_KEY" ] && [ -n "$VAPID_PRIVATE_KEY" ]; } || warn "No push keys were given, so phone notifications stay off. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (from your computer's worker/.env) to $APP_DIR/.env later."
else
  say "Keeping your existing .env"
  if [ -n "$DOMAIN" ]; then set_env_key HOST "$WANT_HOST"; set_env_key DASHBOARD_URL "$WANT_URL"; DID+=("updated the address settings in .env for $DOMAIN"); fi
  if [ -n "$PORT_GIVEN" ]; then set_env_key PORT "$PORT"; DID+=("set PORT=$PORT in .env"); fi
fi

# ---------- build ----------
say "Building the website (this can take a few minutes)"
as_app bash -c 'cd "$1" && set -a && . ./.env && set +a && npm run build' _ "$APP_DIR"
DID+=("built the website")

# ---------- services ----------
say "Installing the services"
render "$SELF_DIR/web.service"    "/etc/systemd/system/$APP_NAME-web.service"
render "$SELF_DIR/worker.service" "/etc/systemd/system/$APP_NAME-worker.service"
systemctl daemon-reload
systemctl enable "$APP_NAME-web" "$APP_NAME-worker" >/dev/null 2>&1
systemctl restart "$APP_NAME-web" "$APP_NAME-worker"
DID+=("restarted $APP_NAME-web and $APP_NAME-worker (nothing else was restarted)")

say "Waiting for the website to answer"
up=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login" 2>/dev/null; then up=1; break; fi
  sleep 2
done
[ "$up" = 1 ] || warn "The website did not answer on port $PORT. Look at: journalctl -u $APP_NAME-web -n 50"
systemctl is-active --quiet "$APP_NAME-worker" || warn "The worker is not running. Look at: journalctl -u $APP_NAME-worker -n 50"

# ---------- nginx + HTTPS ----------
reload_nginx() { nginx -t >/dev/null 2>&1 && systemctl reload nginx; }
cert_for() { # domain
  if [ -d "/etc/letsencrypt/live/$1" ]; then return 0; fi
  local args=(--nginx -d "$1" --non-interactive --agree-tos --redirect)
  if [ -n "$LE_EMAIL" ]; then args+=(-m "$LE_EMAIL"); else args+=(--register-unsafely-without-email); fi
  certbot "${args[@]}" >/dev/null 2>&1 || { warn "Could not get HTTPS for $1. Check that its DNS points at this server, then run this script again."; return 1; }
  DID+=("got HTTPS for $1")
}
add_site() { # template  site-name  domain
  local site="/etc/nginx/sites-available/$2"
  if [ ! -e "$site" ]; then
    render "$1" "$site"
    ln -sf "$site" "/etc/nginx/sites-enabled/$2"
    if ! nginx -t >/dev/null 2>&1; then rm -f "/etc/nginx/sites-enabled/$2" "$site"; die "nginx did not accept the new site, so it was removed again. Run: nginx -t"; fi
    systemctl reload nginx
    DID+=("added the nginx site $2 (nginx was reloaded, not restarted)")
  fi
  cert_for "$3" || true
}
if [ -n "$DOMAIN" ]; then
  say "Setting up nginx for $DOMAIN"
  add_site "$SELF_DIR/nginx.conf" "$APP_NAME" "$DOMAIN"
elif [ "$UPDATE_KEEP_DOMAIN" = 0 ]; then
  say "No DOMAIN given: the website is on http://$PUBLIC_HOST:$PORT (plain http). HTTPS needs a domain."
fi

# ---------- n8n (shared by all projects) ----------
N8N_RUN_USER="$N8N_USER"; N8N_FOLDER="$N8N_DATA"; N8N_RUN_HOME="$N8N_DATA"
n8n_cli() {
  runuser -u "$N8N_RUN_USER" -- env HOME="$N8N_RUN_HOME" N8N_USER_FOLDER="$N8N_FOLDER" \
    bash -c 'set -a; [ -r "$N8N_USER_FOLDER/n8n.env" ] && . "$N8N_USER_FOLDER/n8n.env"; set +a; exec n8n "$@"' _ "$@"
}
wait_n8n() { local i; for i in $(seq 1 45); do curl -fsS -o /dev/null "http://127.0.0.1:$N8N_PORT/healthz" 2>/dev/null && return 0; sleep 2; done; return 1; }

if [ "$SKIP_N8N" = 1 ]; then
  say "SKIP_N8N=1: leaving n8n alone"
else
  say "Checking n8n"
  if ! command -v n8n >/dev/null 2>&1; then
    say "n8n is not installed. Installing it globally (npm install -g n8n). This can take a few minutes."
    npm install -g n8n --no-audit --no-fund >/dev/null 2>&1 || die "Could not install n8n. Try by hand: npm install -g n8n (n8n needs Node 20.19 or newer, or 22)."
    N8N_BIN="$(command -v n8n)"
    DID+=("installed n8n globally")
  else
    N8N_BIN="$(command -v n8n)"
    say "n8n is already installed ($("$N8N_BIN" --version 2>/dev/null | head -n1)). Leaving the install as it is."
  fi

  if [ -e /etc/systemd/system/n8n.service ]; then
    say "Found an existing n8n service. It is not changed."
    u="$(systemctl show n8n -p User --value 2>/dev/null || true)"; N8N_RUN_USER="${u:-root}"
    f="$(systemctl show n8n -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^N8N_USER_FOLDER=//p' | head -n1)"
    N8N_FOLDER="${f:-$(getent passwd "$N8N_RUN_USER" | cut -d: -f6)}"
    N8N_RUN_HOME="$(getent passwd "$N8N_RUN_USER" | cut -d: -f6)"
    p="$(systemctl show n8n -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^N8N_PORT=//p' | head -n1)"; [ -z "$p" ] || N8N_PORT="$p"
    systemctl is-active --quiet n8n || { systemctl start n8n || warn "The existing n8n service would not start. Look at: journalctl -u n8n -n 50"; }
  else
    say "Creating the shared n8n service"
    id "$N8N_USER" >/dev/null 2>&1 || useradd --system --home-dir "$N8N_DATA" --shell /usr/sbin/nologin "$N8N_USER"
    mkdir -p "$N8N_DATA"; chown "$N8N_USER:$N8N_USER" "$N8N_DATA"; chmod 750 "$N8N_DATA"
    if [ ! -f "$N8N_DATA/n8n.env" ]; then
      ( umask 077
        { echo "# Extra n8n settings. Add N8N_ENCRYPTION_KEY here if you want to choose your own."
          if [ -n "$N8N_DOMAIN" ]; then echo "N8N_HOST='$N8N_DOMAIN'"; echo "N8N_PROTOCOL='https'"; echo "WEBHOOK_URL='https://$N8N_DOMAIN/'"; else echo "N8N_SECURE_COOKIE='false'"; fi
        } > "$N8N_DATA/n8n.env" )
      chown "$N8N_USER:$N8N_USER" "$N8N_DATA/n8n.env"
    fi
    render "$SELF_DIR/n8n.service" /etc/systemd/system/n8n.service
    systemctl daemon-reload
    systemctl enable --now n8n >/dev/null 2>&1
    DID+=("created and started the shared n8n service")
    wait_n8n || warn "n8n did not answer on port $N8N_PORT. Look at: journalctl -u n8n -n 50"
  fi

  # Public address for n8n (optional).
  if [ -n "$N8N_DOMAIN" ]; then
    other="$(grep -RlsE "server_name[^;]*[[:space:]]${N8N_DOMAIN//./\\.}([[:space:];]|\$)" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -v "/n8n\$" | head -n1 || true)"
    [ -z "$other" ] || die "The domain $N8N_DOMAIN is already used by another nginx site ($other)."
    say "Setting up nginx for n8n at $N8N_DOMAIN"
    add_site "$SELF_DIR/n8n.nginx.conf" "n8n" "$N8N_DOMAIN"
  fi

  # Import this app's workflows (only the ones n8n does not have yet).
  WF_SRC="$APP_DIR/n8n/workflows"
  if [ -d "$WF_SRC" ] && ls "$WF_SRC"/*.json >/dev/null 2>&1; then
    TMP_N8N="$(mktemp -d)"
    cp "$WF_SRC"/*.json "$TMP_N8N"/
    [ -z "$N8N_CREDENTIALS_FILE" ] || { [ -r "$N8N_CREDENTIALS_FILE" ] && cp "$N8N_CREDENTIALS_FILE" "$TMP_N8N/credentials.in" || warn "Cannot read N8N_CREDENTIALS_FILE ($N8N_CREDENTIALS_FILE)."; }
    chown -R "$N8N_RUN_USER" "$TMP_N8N"   # private folder, only the n8n user can read it
    existing="$(n8n_cli list:workflow 2>/dev/null | cut -d'|' -f1 || true)"
    imported=()
    for f in "$TMP_N8N"/*.json; do
      id="$("$NODE_BIN" -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const w=Array.isArray(j)?j[0]:j;process.stdout.write(String(w.id||""))' "$f")"
      [ -n "$id" ] || { warn "Skipped $(basename "$f"): it has no ID."; continue; }
      if printf '%s\n' "$existing" | grep -Fxq "$id"; then continue; fi
      if n8n_cli import:workflow --input="$f" >/dev/null 2>&1; then imported+=("$id"); else warn "Could not import the workflow $id."; fi
    done

    if [ -f "$TMP_N8N/credentials.in" ]; then
      n8n_cli export:credentials --all --output="$TMP_N8N/have.json" >/dev/null 2>&1 || true
      overlap="$("$NODE_BIN" -e '
        const fs=require("fs");
        const ids=(p)=>{try{const j=JSON.parse(fs.readFileSync(p,"utf8"));return (Array.isArray(j)?j:[j]).map(c=>c&&c.id).filter(Boolean)}catch{return []}};
        const have=new Set(ids(process.argv[2]));
        console.log(ids(process.argv[1]).filter(i=>have.has(i)).join(","))' "$TMP_N8N/credentials.in" "$TMP_N8N/have.json" 2>/dev/null || true)"
      if [ -n "$overlap" ]; then warn "Credentials were NOT imported: n8n already has credentials with the same ID ($overlap). Add the Postgres login by hand in the n8n editor."
      elif n8n_cli import:credentials --input="$TMP_N8N/credentials.in" >/dev/null 2>&1; then DID+=("imported the n8n credentials (delete $N8N_CREDENTIALS_FILE now)"); else warn "Could not import the n8n credentials."; fi
    fi

    if [ "${#imported[@]}" -gt 0 ]; then
      DID+=("imported ${#imported[@]} workflow(s) into n8n: ${imported[*]}")
      notlive=()
      for id in "${imported[@]}"; do
        n8n_cli publish:workflow --id="$id" >/dev/null 2>&1 || n8n_cli update:workflow --id="$id" --active=true >/dev/null 2>&1 || notlive+=("$id")
      done
      say "Restarting the shared n8n once so the new workflows start (other projects' workflows come straight back)"
      systemctl restart n8n && wait_n8n || warn "n8n did not come back on port $N8N_PORT. Look at: journalctl -u n8n -n 50"
      [ "${#notlive[@]}" -eq 0 ] || warn "These workflows are imported but not switched on yet: ${notlive[*]}. Add the 'Supabase Leads DB' Postgres login in n8n, then press Publish on each."
    else
      say "All of this app's workflows are already in n8n. Nothing imported."
    fi
    rm -rf "$TMP_N8N"
  fi
fi

# ---------- firewall (only when you ask) ----------
if [ "$ENABLE_FIREWALL" = 1 ]; then
  say "Setting up the firewall (ufw)"
  ufw allow "$SSH_PORT/tcp" >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  [ -n "$DOMAIN" ] || ufw allow "$PORT/tcp" >/dev/null
  ufw --force enable >/dev/null
  DID+=("turned on ufw: SSH $SSH_PORT, 80, 443$([ -n "$DOMAIN" ] || echo ", $PORT")")
fi

# ---------- summary ----------
echo
echo "=================================================================="
echo " $APP_NAME is ready."
echo "=================================================================="
echo "What this run did:"
for d in "${DID[@]}"; do echo "  - $d"; done
echo
if [ -n "$DOMAIN" ]; then echo "Open:  https://$DOMAIN"; else echo "Open:  http://$PUBLIC_HOST:$PORT   (plain http; the phone app and push notifications need a domain with HTTPS)"; fi
if [ "$SKIP_N8N" != 1 ]; then
  if [ -n "$N8N_DOMAIN" ]; then echo "n8n:   https://$N8N_DOMAIN"; else echo "n8n:   only on the server. From your computer: ssh -L $N8N_PORT:127.0.0.1:$N8N_PORT root@$PUBLIC_HOST  then open http://localhost:$N8N_PORT"; fi
fi
if [ "${#WARNINGS[@]}" -gt 0 ]; then echo; echo "Things to look at:"; for w in "${WARNINGS[@]}"; do echo "  ! $w"; done; fi
echo
echo "Next steps:"
echo "  1. Open the dashboard and sign in. Then fill in Settings (profile, email, AI writer key)."
[ -n "$DOMAIN" ] || echo "  2. To get https later: point a domain at this server and run this script again with DOMAIN=... LE_EMAIL=..."
echo "  3. Start the worker's work: it is already running. Check it:  systemctl status $APP_NAME-worker"
echo
echo "Everyday commands:"
echo "  systemctl status $APP_NAME-web $APP_NAME-worker n8n"
echo "  systemctl restart $APP_NAME-web          systemctl restart $APP_NAME-worker"
echo "  journalctl -u $APP_NAME-web -f           journalctl -u $APP_NAME-worker -f        journalctl -u n8n -f"
echo "  Update:  sudo bash deploy/update.sh      Change a key:  nano $APP_DIR/.env  then restart web and worker"
