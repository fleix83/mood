import "dotenv/config";
import express from "express";
import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

// Turso requires an auth token; without one, use a local SQLite file so the
// app still runs out of the box.
const db =
  url.startsWith("libsql:") && !authToken
    ? createClient({ url: "file:local.db" })
    : createClient({ url, authToken });

if (url.startsWith("libsql:") && !authToken) {
  console.warn(
    "TURSO_AUTH_TOKEN not set — using local file database (local.db).\n" +
      "Add your token to .env to use Turso."
  );
}

async function migrate() {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#D08C60',
        position INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS entry_values (
        date TEXT NOT NULL,
        option_id INTEGER NOT NULL REFERENCES options(id),
        value INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (date, option_id)
      )`,
    ],
    "write"
  );

  const { rows } = await db.execute("SELECT COUNT(*) AS n FROM options");
  if (Number(rows[0].n) === 0) {
    await db.batch(
      [
        {
          sql: "INSERT INTO options (name, color, position) VALUES (?, ?, ?)",
          args: ["Mood", "#D08C60", 0],
        },
        {
          sql: "INSERT INTO options (name, color, position) VALUES (?, ?, ?)",
          args: ["Energy", "#A3B18A", 1],
        },
        {
          sql: "INSERT INTO options (name, color, position) VALUES (?, ?, ?)",
          args: ["Sleep", "#8E9AAF", 2],
        },
      ],
      "write"
    );
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asOption(row) {
  return {
    id: Number(row.id),
    name: row.name,
    color: row.color,
    position: Number(row.position),
    archived: Boolean(Number(row.archived)),
  };
}

// --- Options ---

app.get("/api/options", async (req, res, next) => {
  try {
    const { rows } = await db.execute(
      "SELECT * FROM options WHERE archived = 0 ORDER BY position, id"
    );
    res.json(rows.map(asOption));
  } catch (err) {
    next(err);
  }
});

app.post("/api/options", async (req, res, next) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name is required" });
    const color = req.body.color || "#D08C60";
    const { rows } = await db.execute(
      "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM options"
    );
    const result = await db.execute({
      sql: "INSERT INTO options (name, color, position) VALUES (?, ?, ?) RETURNING *",
      args: [name, color, Number(rows[0].pos)],
    });
    res.status(201).json(asOption(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

app.put("/api/options/:id", async (req, res, next) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name is required" });
    const result = await db.execute({
      sql: "UPDATE options SET name = ?, color = ? WHERE id = ? RETURNING *",
      args: [name, req.body.color || "#D08C60", req.params.id],
    });
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Not found" });
    res.json(asOption(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// Archive instead of delete so history stays intact.
app.delete("/api/options/:id", async (req, res, next) => {
  try {
    await db.execute({
      sql: "UPDATE options SET archived = 1 WHERE id = ?",
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Entries ---

app.get("/api/entries/:date", async (req, res, next) => {
  try {
    if (!DATE_RE.test(req.params.date))
      return res.status(400).json({ error: "Invalid date" });
    const { rows } = await db.execute({
      sql: "SELECT option_id, value, note FROM entry_values WHERE date = ?",
      args: [req.params.date],
    });
    res.json(
      rows.map((r) => ({
        optionId: Number(r.option_id),
        value: Number(r.value),
        note: r.note,
      }))
    );
  } catch (err) {
    next(err);
  }
});

app.put("/api/entries/:date", async (req, res, next) => {
  try {
    if (!DATE_RE.test(req.params.date))
      return res.status(400).json({ error: "Invalid date" });
    const values = req.body.values;
    if (!Array.isArray(values))
      return res.status(400).json({ error: "values must be an array" });
    const stmts = values.map((v) => ({
      sql: `INSERT INTO entry_values (date, option_id, value, note)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (date, option_id)
            DO UPDATE SET value = excluded.value, note = excluded.note`,
      args: [
        req.params.date,
        Number(v.optionId),
        Math.max(0, Math.min(10, Number(v.value) || 0)),
        String(v.note || ""),
      ],
    }));
    if (stmts.length > 0) await db.batch(stmts, "write");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/history", async (req, res, next) => {
  try {
    const { rows } = await db.execute(
      `SELECT e.date, e.option_id, e.value, e.note
       FROM entry_values e
       JOIN options o ON o.id = e.option_id AND o.archived = 0
       ORDER BY e.date`
    );
    res.json(
      rows.map((r) => ({
        date: r.date,
        optionId: Number(r.option_id),
        value: Number(r.value),
        note: r.note,
      }))
    );
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const port = process.env.PORT || 3000;
await migrate();
app.listen(port, () => console.log(`Mood running on http://localhost:${port}`));
