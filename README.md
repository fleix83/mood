# Mood

Ein minimalistischer täglicher Stimmungs-Tracker. Warm, ruhig, Apple-like.

- **Heute** — die Startseite. Tippe auf das grosse **+**, um den heutigen Eintrag zu erstellen: pro Option ein Regler (0–10) und ein Notizfeld. Einträge lassen sich jederzeit bearbeiten.
- **Verlauf** — alle Einträge in einer nahtlosen Grafik, dazu eine Liste aller Tage. Tippe auf einen Tag, um ihn zu bearbeiten.
- **Einstellungen** — Optionen hinzufügen, umbenennen, umfärben oder entfernen.

## Einrichtung

```sh
npm install
cp .env.example .env   # dann den Turso-Token in .env eintragen
npm start
```

Danach http://localhost:3000 öffnen.

Ohne `TURSO_AUTH_TOKEN` nutzt die App eine lokale SQLite-Datei (`local.db`),
funktioniert also sofort. Für die Speicherung in Turso:

```sh
turso db tokens create mood
```

und den Token in `.env` eintragen.

## Stack

Node.js + Express, [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) (Turso / SQLite), Vanilla HTML/CSS/JS, handgebaute SVG-Grafik. Kein Build-Schritt.
