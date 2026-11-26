#!/usr/bin/env bash
# Update this app: pull the newest code, build it, restart only this app.
# Usage:  sudo bash deploy/update.sh
#         sudo APP_NAME=other bash deploy/update.sh      (another app on the same server)
set -euo pipefail
exec bash "$(dirname "${BASH_SOURCE[0]}")/setup_vps.sh" --update
