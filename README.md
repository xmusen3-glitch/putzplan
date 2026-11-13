# Familien-Putzplan V2

Vorher-Foto, putzen, Nachher-Foto, Haken dran. Mit Punkten, Rangliste, Reaktionen und einer Übersicht für Admins.

V2 läuft auf einem eigenen Server: ein Node-Dienst liefert die App aus, prüft alle Regeln (Rollen, PIN, Punkte) und schickt Änderungen live an alle offenen Geräte. Die Daten liegen in einer SQLite-Datei, die Fotos als Dateien daneben. Das Konzept dazu steht in [KONZEPT-V2.md](KONZEPT-V2.md).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `server/` | Dienst: Anfragen (`api.js`), Datenbank und Fotos (`db.js`), Anmeldung und Live-Kanal (`core.js`), Push und Wecker (`push.js`), Umzug aus V1 (`migrate-v1.js`) |
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

```bash
docker compose up -d --build
```

Der Container hängt im Docker-Netz `proxy`. Im Nginx Proxy Manager einen Proxy Host auf `putzplan`, Port `8080` anlegen, mit SSL. Die Daten liegen neben der `docker-compose.yml` im Ordner `data/`. Für eine Sicherung reicht es, diesen Ordner zu kopieren.

In Cloudflare genügt der normale Proxy. Fotos und Daten werden dort nicht zwischengespeichert, weil sie nur mit Anmeldung abrufbar sind.

## Sicherheit in Kürze

- Der Einladungslink enthält nur einen Beitritts-Code. Damit sieht ein Gerät die Namen und kann eine PIN versuchen, mehr nicht.
- PINs prüft der Server (scrypt), nach fünf Fehlversuchen ist fünf Minuten Pause.
- Was Admin, Mitglied und Kind dürfen, entscheidet der Server. Punkte vergibt er selbst.
- Fotos sind nur mit Anmeldung abrufbar und werden nach der eingestellten Zeit gelöscht.
