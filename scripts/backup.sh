#!/bin/sh
# Nächtliche Sicherung des Putzplans, platzsparend:
#   - Datenbank: stimmige, gepackte Kopie pro Tag (14 Tage, dazu der Monatserste für ein Jahr)
#   - Fotos: Hardlinks. Jedes Foto bekommt im Sicherungsordner einen zweiten Namen und belegt
#     dadurch keinen zusätzlichen Platz. Löscht die App ein Foto, bleibt es hier noch 30 Tage.
# Schützt vor Fehlern und versehentlichem Löschen, NICHT vor einem Ausfall der Festplatte
# (dafür müsste eine Kopie auf einen anderen Rechner).
# Aufruf als root: /opt/putzplan/scripts/backup.sh   Zeitplan: /etc/cron.d/putzplan-backup
set -eu

APP=$(cd "$(dirname "$0")/.." && pwd)
DEST=${BACKUP_DIR:-/opt/backup/putzplan}
day=$(date +%F)
mkdir -p "$DEST/db" "$DEST/photos"
chmod 700 "$DEST"

# 1) Datenbank aus dem laufenden Container kopieren, prüfen, packen
info=$(docker exec putzplan node server/backup.js /data/.sicherung.db)
gzip -c "$APP/data/.sicherung.db" > "$DEST/db/putzplan-$day.db.gz.tmp"
mv "$DEST/db/putzplan-$day.db.gz.tmp" "$DEST/db/putzplan-$day.db.gz"
rm -f "$APP/data/.sicherung.db"

# 2) Fotos: neue Dateien als Hardlink in die Sicherung hängen
new=0
for f in "$APP"/data/photos/*.jpg; do
  [ -e "$f" ] || continue
  b="$DEST/photos/${f##*/}"
  if [ ! -e "$b" ]; then ln "$f" "$b"; new=$((new + 1)); fi
done

# 3) Aufräumen: alte Tageskopien, alte Monatskopien, und Fotos, die die App vor über 30 Tagen gelöscht hat
find "$DEST/db" -name 'putzplan-*.db.gz' -mtime +14 ! -name 'putzplan-????-??-01.db.gz' -delete
find "$DEST/db" -name 'putzplan-????-??-01.db.gz' -mtime +400 -delete
find "$DEST/photos" -type f -links 1 -ctime +30 -delete

# Zeitpunkt merken: die App zeigt ihn Admins unter Verwaltung > Regeln und warnt, wenn er zu alt wird
date -Iseconds > "$APP/data/.letzte-sicherung"

total=$(find "$DEST/photos" -type f | wc -l)
echo "$(date '+%F %T') $info | Fotos: $new neu, $total gesichert | Kopien der Datenbank: $(ls "$DEST/db" | wc -l)"
