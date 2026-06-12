# Mood

A minimal daily mood tracker. Warm, quiet, Apple-like.

- **Today** — the default page. Tap the big **+** to create today's entry: one slider (0–10) and a note field per option. Entries can be edited any time.
- **History** — all entries in one seamless graph, plus a day-by-day list. Tap a day to edit it.
- **Settings** — add, rename, recolor, or remove the options you track.

## Setup

```sh
npm install
cp .env.example .env   # then paste your Turso auth token into .env
npm start
```

Open http://localhost:3000.

Without a `TURSO_AUTH_TOKEN` the app falls back to a local SQLite file
(`local.db`) so you can use it right away. To store data in Turso:

```sh
turso db tokens create mood
```

and put the token in `.env`.

## Stack

Node.js + Express, [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) (Turso / SQLite), vanilla HTML/CSS/JS, hand-rolled SVG chart. No build step.
