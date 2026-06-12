# Mood

Ein minimalistischer täglicher Stimmungs-Tracker. Warm, ruhig, Apple-like.

- **Heute** — die Startseite. Tippe auf das grosse **+**, um den heutigen Eintrag zu erstellen: pro Option ein Regler (0–10) und ein Notizfeld. Einträge lassen sich jederzeit bearbeiten.
- **Verlauf** — alle Einträge in einer nahtlosen Grafik, dazu eine Liste aller Tage. Tippe auf einen Tag, um ihn zu bearbeiten.
- **Einstellungen** — Optionen hinzufügen, umbenennen, umfärben oder entfernen.

Die App ist **komplett statisch**: Der Browser spricht direkt mit der
Turso-Datenbank. Es braucht keinen Server — jedes Webhosting reicht.

## Entwicklung

```sh
npm install
cp config.example.json config.json   # Turso-URL und -Token eintragen
npm run build                        # erzeugt dist/
```

`dist/` mit einem beliebigen Webserver öffnen (z. B. via XAMPP:
http://localhost/mood/dist/).

## Deployment aufs Webhosting

1. `npm run build`
2. Inhalt von `dist/` auf den Webspace laden (FTP oder via `dist`-Branch).
3. **Einmalig von Hand** auf den Webspace legen (sind nicht im Git):
   - `config.json` (Kopie von `config.example.json` mit echtem Token)
   - Passwortschutz aktivieren — entweder Verzeichnisschutz im Control
     Panel des Hosters oder die Vorlage in der mitgelieferten `.htaccess`
     einkommentieren.

**Wichtig:** `config.json` enthält den Turso-Token und darf nie ins Git —
das Repo ist öffentlich. Sie ist in `.gitignore` eingetragen. Der Token ist
im Browser einsehbar; deshalb ist der Passwortschutz dringend empfohlen.

## Stack

[@libsql/client/web](https://github.com/tursodatabase/libsql-client-ts) (Turso direkt aus dem Browser), Vanilla HTML/CSS/JS, handgebaute SVG-Grafik, esbuild als einziger Build-Schritt.
