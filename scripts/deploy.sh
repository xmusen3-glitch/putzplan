#!/bin/sh
# Automatisches Ausrollen. Holt neue Stände des Git-Zweigs, der hier ausgecheckt ist, baut sie (die Tests
# laufen beim Bauen mit), startet neu und prüft, ob wirklich der neue Stand läuft.
# Geht etwas schief, läuft der alte Stand weiter und der fehlerhafte wird nicht nochmal versucht.
# Aufruf als root, alle paar Minuten über /etc/cron.d/putzplan-deploy. Ohne neuen Stand passiert nichts.
set -eu

APP=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP"
DEST=${BACKUP_DIR:-/opt/backup/putzplan}
IMAGE=putzplan-putzplan
log() { echo "$(date '+%F %T') $*"; }

# Nie zwei Läufe gleichzeitig
exec 9>/var/lock/putzplan-deploy.lock
flock -n 9 || exit 0

branch=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin "$branch" 2>/dev/null || exit 0
old=$(git rev-parse HEAD)
new=$(git rev-parse "origin/$branch")
[ "$old" = "$new" ] && exit 0
[ -f .deploy-failed ] && [ "$(cat .deploy-failed)" = "$new" ] && exit 0
short=$(git rev-parse --short "$new")
oldshort=$(git rev-parse --short "$old")
log "Neuer Stand $short auf $branch (bisher $oldshort)"

# Abbruch vor dem Neustart: Quelltext zurück auf den laufenden Stand, fehlerhaften Stand merken
fail() {
  git reset -q --hard "$old"
  echo "$new" > .deploy-failed
  log "FEHLER: $1. Es läuft weiter $oldshort."
  exit 1
}

git merge -q --ff-only "origin/$branch" 2>/dev/null || fail "Der Zweig lässt sich nicht vorspulen (Verlauf umgeschrieben oder Dateien hier geändert)"

# Vor jedem Update eine Kopie der Datenbank, die letzten fünf bleiben
mkdir -p "$DEST/db"
if docker exec putzplan node server/backup.js /data/.sicherung.db >/dev/null 2>&1; then
  gzip -c data/.sicherung.db > "$DEST/db/vor-update-$(date +%F-%H%M)-$short.db.gz"
  rm -f data/.sicherung.db
  ls -1t "$DEST"/db/vor-update-*.db.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

# Bauen. Das bisherige Image bleibt als "vorher" für den Rückweg erhalten.
docker tag "$IMAGE:latest" "$IMAGE:vorher" 2>/dev/null || true
if ! GIT_SHA=$short docker compose build -q > /tmp/putzplan-build.log 2>&1; then
  tail -n 30 /tmp/putzplan-build.log
  fail "Bauen oder Tests fehlgeschlagen"
fi

# Neu starten und warten, bis der neue Stand antwortet
docker compose up -d --no-build > /dev/null 2>&1 || true
ok=0
i=0
while [ "$i" -lt "${HEALTH_TRIES:-30}" ]; do
  if docker exec putzplan wget -qO- "${HEALTH_URL:-http://127.0.0.1:8080/healthz}" 2>/dev/null | grep -q "\"version\":\"$short\""; then ok=1; break; fi
  i=$((i + 1))
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  docker tag "$IMAGE:vorher" "$IMAGE:latest"
  git reset -q --hard "$old"
  docker compose up -d --no-build > /dev/null 2>&1 || true
  echo "$new" > .deploy-failed
  log "FEHLER: $short ist nicht gesund gestartet. Zurück auf $oldshort."
  exit 1
fi

rm -f .deploy-failed
# Nur die eigenen, nicht mehr benutzten Images wegräumen (sonst wächst der Platzbedarf mit jedem Update)
docker image prune -f --filter "label=app=putzplan" > /dev/null 2>&1 || true
log "Ausgerollt: $short läuft."
