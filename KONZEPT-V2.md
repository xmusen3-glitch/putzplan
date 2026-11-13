# Putzplan V2 – Konzept (1. Entwurf)

Stand: 13.11.2026 · Klickbarer Entwurf: [`konzept/index.html`](konzept/index.html) (einfach im Browser öffnen, läuft mit Beispieldaten, speichert nichts)

Oben im Entwurf lässt sich zwischen **Admin**, **Mitglied** und **Kind** umschalten, rechts daneben Hell/Dunkel.

## Was heute hakt und warum

| Problem | Ursache in V1 | Lösung in V2 |
|---|---|---|
| Bilder laden langsam | Fotos liegen als Text in der Datenbank. Jedes Bild wird einzeln geholt, und bei jedem Neuzeichnen wieder von vorn. | Echte Bilddateien mit kleinem Vorschaubild. Einmal geladen, bleiben sie auf dem Handy. |
| Seite lädt sichtbar neu | Alle 30 Sekunden und nach jeder Aktion werden alle Daten neu geholt und die ganze Seite neu aufgebaut. | Nur das, was sich geändert hat, wird ausgetauscht. |
| Reaktionen verzögert, nicht live | Ein Klick wartet erst auf den Server und dann auf das komplette Neuladen. Die anderen sehen es erst beim nächsten 30-Sekunden-Takt. | Die Reaktion erscheint sofort. Der Server schickt jede Änderung live an alle offenen Handys. |
| Admin ohne Übersicht | Admin-Funktionen sind über drei Tabs verstreut, ein Gesamtbild fehlt. | Eigener Bereich „Übersicht“ und eine aufgeräumte „Verwaltung“. |
| Es wird voll | Die Heute-Seite hat bis zu zehn Blöcke untereinander. | Ein Kopf, „Meins“, „Offen“ mit Raum-Filter. Alles andere hat seinen eigenen Tab. |
| Emojis als Knöpfe | Bedienung und Deko sind nicht zu unterscheiden. | Icons für die Bedienung. Emojis bleiben für Persönliches: Avatar, Reaktionen, Emoji-Regen. |
| Regeln gelten nur in der App | Wer was darf, prüft allein das Handy. | Rollen, PIN und Punkte prüft der Server. |

## Aufbau

**Alle (4 Tabs unten, am PC links als Leiste)**

- **Heute**: ein Kopf mit Tagesziel, Serie, Wochenpunkten und Konto. Darunter „Meins“ (läuft gerade, zugewiesen, Waschtag) und „Offen“ mit Raum-Filter statt langer Klapplisten. Wer gerade putzt, steht direkt in der Liste mit „Mithelfen“.
- **Fotos**: Vorher/Nachher als Feed, nach Tag gruppiert, Filter nach Person. Reaktionen sofort, Kommentare eingeklappt.
- **Rangliste**: Heute, Woche, Monat. Dazu Fair-O-Meter, Belohnungen und Abmahnungen.
- **Ich**: eigene Zahlen, Punkte-Verlauf, Emoji, Benachrichtigungen, Aufgabe vorschlagen.

**Admin zusätzlich**

- **Übersicht**: vier Zahlen (erledigt, läuft, liegengeblieben, zu prüfen), der Eingang „Wartet auf dich“, die Familie heute auf einen Blick, die Woche als Raster (wer hat an welchem Tag sein Ziel geschafft), der Stand je Raum und die Schnell-Knöpfe.
- **Verwaltung**: Aufgaben (Suche, Raum-Filter, an/aus mit einem Tipp), Familie, Regeln, Protokoll.

## Neu für Admins

- **Fotos prüfen am Stück**: alle neuen Vorher/Nachher-Paare nacheinander, je drei Knöpfe: Passt, Nochmal (geht mit Hinweis zurück), Ablehnen.
- **Aufgabe gezielt zuweisen**, auch liegengebliebene, mit Benachrichtigung an die Person.
- **Personen-Ansicht**: Tag, Woche und alle Aktionen zu einer Person an einem Ort.
- **Abwesenheit mit Zeitraum** (Urlaub, krank) statt Schalter „pausiert“.
- **Protokoll**: jede Änderung mit Uhrzeit und Person, Admin-Aktionen lassen sich zurücknehmen.
- **Durchsage** als Benachrichtigung an alle.
- **Regel „Punkte zählen erst nach dem Prüfen“**, abschaltbar.
- **Mehrere Rollen**: Admin, Mitglied, Kind.

## Technik

Empfehlung: **auf den eigenen Server umziehen.**

- **Server**: ein kleiner Node-Dienst im Docker-Container, hinter Nginx Proxy Manager und Cloudflare, eigene Subdomain. Er liefert die App aus, beantwortet die Anfragen und hält den Live-Kanal (Server-Sent Events) offen.
- **Datenbank**: SQLite, eine Datei auf dem Server. Für eine Familie reicht das locker, und die Sicherung ist das Kopieren einer Datei.
- **Fotos**: Dateien auf dem Server in zwei Größen (Vorschau und voll), nur mit Anmeldung abrufbar, dauerhaft im Handy-Cache.
- **Anmeldung**: Der Einladungslink enthält nur noch einen Haushalts-Code und keinen Datenbank-Zugang mehr. Die PIN prüft der Server, nach mehreren Fehlversuchen gibt es eine kurze Sperre. Was Admin, Mitglied und Kind dürfen, entscheidet der Server.
- **Benachrichtigungen**: Push direkt vom Server, der stündliche Wecker läuft im selben Dienst.
- **Oberfläche**: weiterhin eine installierbare Web-App, gebaut mit Vite und Svelte. Icons von Lucide, lokal eingebunden.
- **Cloudflare**: HTTPS, Schutz vor Anmelde-Versuchen in Serie, App-Dateien aus dem Cache. Fotos werden dort nicht zwischengespeichert.

Warum nicht bei Supabase bleiben: Bilder und Live ließen sich dort auch lösen. Die Rechte bleiben aber schwer sauber zu bekommen, solange jedes Handy direkt mit der Datenbank spricht, und die Fotos aus dem Haus lägen weiter bei einem fremden Anbieter. Der Preis des eigenen Servers: Sicherungen und Updates sind Eigenleistung.

## Reihenfolge

1. Konzept abstimmen (dieser Entwurf)
2. Server-Grundgerüst: Datenbank, Anmeldung, Rollen
3. Fotos als Dateien mit Vorschaubildern
4. Oberfläche für alle mit Live-Kanal
5. Oberfläche für Admins: Übersicht, Verwaltung, Protokoll
6. Push und Wecker
7. Umzug der Daten aus Supabase, Probelauf neben V1
8. Umschalten

V1 bleibt auf `main` unverändert in Betrieb, bis V2 fertig ist.

## Offene Entscheidungen

- Eigener Server wie empfohlen?
- Unter welcher Adresse soll die App laufen?
- Sollen Punkte erst nach dem Prüfen zählen oder wie bisher sofort?
- Repo privat stellen, sobald GitHub Pages nicht mehr gebraucht wird?
