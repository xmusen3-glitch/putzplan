# Familien-Putzplan V2

Vorher-Foto, putzen, Nachher-Foto, Haken dran. Mit Punkten, Rangliste, Reaktionen und einer Übersicht für Admins.

V2 läuft auf einem eigenen Server: ein Node-Dienst liefert die App aus, prüft alle Regeln (Rollen, PIN, Punkte) und schickt Änderungen live an alle offenen Geräte. Die Daten liegen in einer SQLite-Datei, die Fotos als Dateien daneben. Das Konzept dazu steht in [KONZEPT-V2.md](KONZEPT-V2.md).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `server/` | Dienst: Anfragen (`api.js`), Datenbank und Fotos (`db.js`), Anmeldung und Live-Kanal (`core.js`), Push und Wecker (`push.js`), Umzug aus V1 (`migrate-v1.js`), Helfer für die Konsole (`invite.js`, `reset-pin.js`) |
| `shared/logic.js` | Regeln, die Server und App teilen: Fälligkeit, Punkte, Serie, Konto |
| `web/` | Die App (Svelte, Vite). Ansichten in `src/views`, Dialoge in `src/sheets` |
| `data/` | Datenbank und Fotos (wird beim ersten Start angelegt, nicht im Repo) |

## Lokal starten

Braucht Node 24 oder neuer.

```bash
npm install
```

```bash
npm run dev
```

Die App läuft dann auf http://localhost:5173. Den Einladungslink dazu gibt `npm run einladung` aus. Bei einer leeren Datenbank legt der Dienst eine Admin-Person und die Standard-Aufgaben an und schreibt den Einladungslink in die Konsole. In der Entwicklung gibt es in der Kamera einen Knopf „Testbild“, falls der Rechner keine Kamera hat.

## Daten aus V1 holen

Liest in Supabase nur und ändert dort nichts. Kann beliebig oft laufen.

```bash
SB_URL=https://<projekt>.supabase.co SB_KEY=<publishable key> FAMILIE=<Familien-Geheimcode> npm run umzug
```

Die PINs aus V1 gelten weiter. Was schon erledigt war, zählt als geprüft.

## Auf dem Server

Die App läuft unter https://dokas-family.com. Einmalig im Projektordner auf dem Server:

```bash
cp .env.example .env && mkdir -p data && chown 1000:1000 data
```

```bash
docker compose up -d --build
```

Der Container läuft nicht als root, deshalb gehört der Ordner `data/` dem Benutzer 1000. Er hängt im Docker-Netz `proxy`. Im Nginx Proxy Manager einen Proxy Host für `dokas-family.com` und `www.dokas-family.com` auf `putzplan`, Port `8080` anlegen, mit SSL. Die Daten liegen neben der `docker-compose.yml` im Ordner `data/`. Für eine Sicherung reicht es, diesen Ordner zu kopieren.

Der Einladungslink:

```bash
docker exec putzplan node server/invite.js
```

Der Umzug aus V1 läuft auf dem Server im Container:

```bash
docker exec -e SB_URL=https://<projekt>.supabase.co -e SB_KEY=<publishable key> -e FAMILIE=<Familien-Geheimcode> putzplan node server/migrate-v1.js
```

In Cloudflare genügt der normale Proxy. Fotos und Daten werden dort nicht zwischengespeichert, weil sie nur mit Anmeldung abrufbar sind.

## Sicherheit in Kürze

- Der Einladungslink enthält nur einen Beitritts-Code. Damit sieht ein Gerät die Namen und kann eine PIN versuchen, mehr nicht.
- PINs prüft der Server (scrypt), nach fünf Fehlversuchen ist fünf Minuten Pause.
- Was Admin, Mitglied und Kind dürfen, entscheidet der Server. Punkte vergibt er selbst.
- Fotos sind nur mit Anmeldung abrufbar und bleiben dauerhaft gespeichert. Die App zeigt die letzten Wochen sofort, ältere lädt sie unter „Fotos“ nach.

## V1 als Archiv

Seit dem 14.11.2026 ist V2 der Branch `main`. Die alte Fassung bleibt erhalten:

- **Code:** Branch `v1-archiv` und Tag `v1`.
- **Alte Adresse:** `xmusen3-glitch.github.io/putzplan` gibt es weiter. Dahinter liegt die `index.html` im Hauptordner dieses Repos, die auf dokas-family.com weiterleitet. Sie gehört nicht zur App.
- **Daten:** Alles wurde übernommen und mit `server/verify-v1.js` abgeglichen (jede Zeile, jedes Foto über Prüfsummen). Die unveränderten Rohdaten aus V1 liegen auf dem Server unter `/opt/backup/putzplan/v1-archiv/`.
- **Übergang für alte Geräte:** Wer noch die alte App oder den alten Link öffnet, wird von der alten Adresse mit seiner Familie und seinem Namen zur neuen geschickt. Die neue App nimmt das Gerät dann von selbst auf und zeigt gleich den richtigen Namen, nur die PIN muss noch eingegeben werden. Das gilt befristet (`node server/v1-door.js` zeigt, bis wann; `zu` schließt es). Auf dem Server liegt dafür nur eine Prüfsumme des alten Familien-Geheimcodes. Ein neuer Einladungslink in der App beendet den Übergang sofort.
- **Nachzügler:** Falls nach dem Umschalten noch jemand in der alten App etwas erledigt hat, holt `node server/migrate-v1.js --nur-neues` nur das Fehlende nach und fasst nichts an, was in V2 schon steht.

Das alte Supabase-Projekt ist seit dem 14.11.2026 eingefroren: Mit dem Familien-Geheimcode lässt sich alles noch lesen, aber nichts mehr schreiben, und der stündliche Wecker für Benachrichtigungen ist abgeschaltet. Dafür lief im SQL Editor dort einmal:

```sql
-- V1 einfrieren: nur noch lesen, stündlichen Wecker abschalten
do $$
declare t text;
begin
  foreach t in array array['members','tasks','completions','photos','settings','reactions','push_subs','push_config'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists familie on public.%I', t);
      execute format('create policy familie on public.%I for select to anon, authenticated using (public.fam_ok())', t);
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'putzplan-stuendlich';
```

Rückgängig machen ließe sich das mit den SQL-Dateien aus dem Branch `v1-archiv` (`supabase-setup.sql` und `supabase-update-4-push.sql` legen Rechte, Regeln und Wecker wieder an). Kostenlose Supabase-Projekte werden nach längerer Zeit ohne Nutzung pausiert; das Archiv auf dem eigenen Server ist davon unabhängig.

## PIN vergessen

Auf dem Anmeldeschirm gibt es unter dem Ziffernfeld „PIN vergessen?“. Das meldet sich bei den Admins: in der Übersicht steht dann „PIN vergessen: Name“, ein Tipp setzt die PIN zurück. Danach legt die Person beim nächsten Öffnen eine neue fest. Admins können eine PIN auch jederzeit über die Person zurücksetzen.

Hat die einzige Admin-Person ihre PIN vergessen, hilft der Befehl am Server:

```bash
docker exec putzplan node server/reset-pin.js Dorina
```

## Testen und automatisch ausrollen

```bash
npm test
```

Die Tests starten einen echten Server mit leerer Datenbank in einem Wegwerf-Ordner und spielen die wichtigen Abläufe durch (Anmeldung, Rechte, Aufgaben, Fotos, Live-Kanal). Dazu kommen Tests der Regeln in `shared/logic.js`.

- **Bei GitHub** baut und testet `.github/workflows/test.yml` jeden Push und jeden Pull Request. Ausgerollt wird von dort nichts, es liegen keine Zugangsdaten zum Server bei GitHub.
- **Auf dem Server** schaut `scripts/deploy.sh` alle fünf Minuten nach (Zeitplan in `/etc/cron.d/putzplan-deploy`, Protokoll in `/var/log/putzplan-deploy.log`). Gibt es auf dem ausgecheckten Zweig einen neuen Stand, wird er gebaut. Die Tests laufen beim Bauen mit: schlägt einer fehl, entsteht kein Image und der alte Stand läuft weiter. Danach wird neu gestartet und geprüft, ob wirklich der neue Stand antwortet. Wenn nicht, geht es zurück auf den vorherigen. Vor jedem Update entsteht eine Kopie der Datenbank.

Welcher Zweig ausgerollt wird, bestimmt der Server: der, der in `/opt/putzplan` ausgecheckt ist. Alles, was auf diesem Zweig landet, läuft wenige Minuten später. Welcher Stand läuft, steht in der App unter „Ich“ ganz unten und unter `/healthz`. Offene Apps bekommen nach einem Update einen Hinweis zum Aktualisieren.

Automatik anhalten: die Datei `/etc/cron.d/putzplan-deploy` löschen. Von Hand ausrollen geht weiterhin mit `git pull && docker compose up -d --build`.

## Sicherung

Jede Nacht um 3:30 Uhr läuft `scripts/backup.sh` (Zeitplan in `/etc/cron.d/putzplan-backup`, Protokoll in `/var/log/putzplan-backup.log`) und schreibt nach `/opt/backup/putzplan`:

- `db/`: eine geprüfte, gepackte Kopie der Datenbank pro Tag. 14 Tage bleiben, dazu der Monatserste für ein Jahr.
- `photos/`: alle Fotos als Hardlinks. Das belegt keinen zusätzlichen Platz. Löscht die App ein Foto, bleibt es dort noch 30 Tage.

Das schützt vor Fehlern und versehentlichem Löschen. Vor einem Ausfall der Festplatte schützt es nicht, dafür müsste eine Kopie auf einen anderen Rechner.

Zurückholen (Stand eines Tages):

```bash
cd /opt/putzplan && docker compose stop
```

```bash
gunzip -c /opt/backup/putzplan/db/putzplan-JJJJ-MM-TT.db.gz > data/putzplan.db && rm -f data/putzplan.db-wal data/putzplan.db-shm && chown 1000:1000 data/putzplan.db
```

```bash
cp -aln /opt/backup/putzplan/photos/. data/photos/ ; docker compose start
```

## Speicherplatz

Weil Fotos nicht mehr gelöscht werden, wächst der Ordner `data/photos`. Grob gerechnet: zwei Fotos je Aufgabe mit zusammen etwa 0,4 MB, bei 30 Aufgaben am Tag sind das rund 4 bis 5 GB im Jahr. Der Ordner gehört in die Sicherung.
