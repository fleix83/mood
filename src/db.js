import { createClient } from "@libsql/client/web";

let db;

export async function init() {
  const res = await fetch("config.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      "config.json nicht gefunden. Bitte config.example.json kopieren, " +
        "Turso-URL und -Token eintragen und neben die App legen."
    );
  }
  const cfg = await res.json();
  db = createClient({ url: cfg.databaseUrl, authToken: cfg.authToken });
  await migrate();
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
    const seed = [
      ["Energie", "#D08C60"],
      ["Kognition/Geist", "#8E9AAF"],
      ["Sensibilität", "#A3B18A"],
      ["Schlaf", "#9C89B8"],
    ];
    await db.batch(
      seed.map(([name, color], i) => ({
        sql: "INSERT INTO options (name, color, position) VALUES (?, ?, ?)",
        args: [name, color, i],
      })),
      "write"
    );
  }
}

function asOption(row) {
  return {
    id: Number(row.id),
    name: row.name,
    color: row.color,
    position: Number(row.position),
    archived: Boolean(Number(row.archived)),
  };
}

export async function options() {
  const { rows } = await db.execute(
    "SELECT * FROM options WHERE archived = 0 ORDER BY position, id"
  );
  return rows.map(asOption);
}

export async function addOption(name, color) {
  const { rows } = await db.execute(
    "SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM options"
  );
  const result = await db.execute({
    sql: "INSERT INTO options (name, color, position) VALUES (?, ?, ?) RETURNING *",
    args: [name, color, Number(rows[0].pos)],
  });
  return asOption(result.rows[0]);
}

export async function updateOption(id, name, color) {
  const result = await db.execute({
    sql: "UPDATE options SET name = ?, color = ? WHERE id = ? RETURNING *",
    args: [name, color, id],
  });
  return result.rows.length ? asOption(result.rows[0]) : null;
}

// Archivieren statt löschen, damit der Verlauf erhalten bleibt.
export async function removeOption(id) {
  await db.execute({
    sql: "UPDATE options SET archived = 1 WHERE id = ?",
    args: [id],
  });
}

export async function entry(date) {
  const { rows } = await db.execute({
    sql: "SELECT option_id, value, note FROM entry_values WHERE date = ?",
    args: [date],
  });
  return rows.map((r) => ({
    optionId: Number(r.option_id),
    value: Number(r.value),
    note: r.note,
  }));
}

export async function saveEntry(date, values) {
  const stmts = values.map((v) => ({
    sql: `INSERT INTO entry_values (date, option_id, value, note)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (date, option_id)
          DO UPDATE SET value = excluded.value, note = excluded.note`,
    args: [
      date,
      Number(v.optionId),
      Math.max(0, Math.min(10, Number(v.value) || 0)),
      String(v.note || ""),
    ],
  }));
  if (stmts.length > 0) await db.batch(stmts, "write");
}

export async function history() {
  const { rows } = await db.execute(
    `SELECT e.date, e.option_id, e.value, e.note
     FROM entry_values e
     JOIN options o ON o.id = e.option_id AND o.archived = 0
     ORDER BY e.date`
  );
  return rows.map((r) => ({
    date: r.date,
    optionId: Number(r.option_id),
    value: Number(r.value),
    note: r.note,
  }));
}
