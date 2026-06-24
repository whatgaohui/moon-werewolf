#!/usr/bin/env bash
# Persistent watchdog using subshell-orphan + setsid technique.
# Restarts the Next.js dev server (port 3000) whenever it dies.
# Launch via: ( setsid bash /home/z/my-project/dev-watchdog.sh </dev/null >/dev/null 2>&1 & )
cd /home/z/my-project

while true; do
  pkill -f "next dev -p 3000" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  sleep 1
  echo "[watchdog $(date '+%H:%M:%S')] starting dev server..." >> /home/z/my-project/watchdog.log
  # Foreground in this loop; restarts when it exits.
  bun run dev > /home/z/my-project/dev.log 2>&1
  echo "[watchdog $(date '+%H:%M:%S')] dev server exited ($?), restarting in 3s..." >> /home/z/my-project/watchdog.log
  sleep 3
done
