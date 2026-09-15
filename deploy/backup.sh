#!/bin/sh
# Copies the app's snapshots to an off-machine remote, once a day.
#
# The app already writes consistent snapshots (VACUUM INTO) into
# /data/backups: a daily one, and one before every schema change. This just
# gets them off the box. Set RCLONE_REMOTE to something like "b2:chaos-backups"
# or "s3:my-bucket/chaos" after `rclone config`.
set -eu
: "${RCLONE_REMOTE:?set RCLONE_REMOTE, e.g. b2:chaos-backups}"
while true; do
  if [ -d /data/backups ]; then
    rclone copy /data/backups "$RCLONE_REMOTE/backups" --min-age 1m --no-traverse -q \
      && echo "[backup] $(date -u +%FT%TZ) copied to $RCLONE_REMOTE" \
      || echo "[backup] $(date -u +%FT%TZ) copy failed"
    # Keep the remote from growing forever: anything older than 60 days goes.
    rclone delete "$RCLONE_REMOTE/backups" --min-age 60d -q || true
  fi
  sleep 86400
done
