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
      `CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS entry_values (
        entry_id INTEGER NOT NULL REFERENCES entries(id),
        option_id INTEGER NOT NULL REFERENCES options(id),
        value INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (entry_id, option_id)
      )`,
    ],
    "write"
  );

  // Altes Schema (ein Eintrag pro Tag, direkt mit Datum verknüpft) auf die
  // neue entries-Tabelle umziehen. Alte Einträge bekommen 12:00 als Uhrzeit.
  const legacy = await db.execute(
    "SELECT 1 FROM pragma_table_info('entry_values') WHERE name = 'date'"
  );
  if (legacy.rows.length > 0) {
    await db.batch(
      [
        `ALTER TABLE entry_values RENAME TO entry_values_legacy`,
        `CREATE TABLE entry_values (
          entry_id INTEGER NOT NULL REFERENCES entries(id),
          option_id INTEGER NOT NULL REFERENCES options(id),
          value INTEGER NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (entry_id, option_id)
        )`,
        `INSERT INTO entries (date, created_at)
         SELECT DISTINCT date, date || 'T12:00:00' FROM entry_values_legacy`,
        `INSERT INTO entry_values (entry_id, option_id, value, note)
         SELECT en.id, l.option_id, l.value, l.note
         FROM entry_values_legacy l
         JOIN entries en ON en.date = l.date`,
        `DROP TABLE entry_values_legacy`,
      ],
      "write"
    );
  }

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

// Alle Einträge eines Tages, älteste zuerst.
export async function entriesForDay(date) {
  const { rows } = await db.execute({
    sql: `SELECT en.id AS entry_id, en.created_at, v.option_id, v.value, v.note
          FROM entries en
          LEFT JOIN entry_values v ON v.entry_id = en.id
          WHERE en.date = ?
          ORDER BY en.created_at, en.id`,
    args: [date],
  });
  const byId = new Map();
  for (const r of rows) {
    const id = Number(r.entry_id);
    if (!byId.has(id)) byId.set(id, { id, createdAt: r.created_at, values: [] });
    if (r.option_id != null) {
      byId.get(id).values.push({
        optionId: Number(r.option_id),
        value: Number(r.value),
        note: r.note,
      });
    }
  }
  return [...byId.values()];
}

function valueStmts(entryId, values) {
  return values.map((v) => ({
    sql: `INSERT INTO entry_values (entry_id, option_id, value, note)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (entry_id, option_id)
          DO UPDATE SET value = excluded.value, note = excluded.note`,
    args: [
      entryId,
      Number(v.optionId),
      Math.max(0, Math.min(10, Number(v.value) || 0)),
      String(v.note || ""),
    ],
  }));
}

export async function addEntry(date, createdAt, values) {
  const result = await db.execute({
    sql: "INSERT INTO entries (date, created_at) VALUES (?, ?) RETURNING id",
    args: [date, createdAt],
  });
  const id = Number(result.rows[0].id);
  if (values.length > 0) await db.batch(valueStmts(id, values), "write");
  return id;
}

export async function updateEntry(entryId, values) {
  // Werte komplett ersetzen, damit ausgelassene Optionen verschwinden.
  await db.batch(
    [
      { sql: "DELETE FROM entry_values WHERE entry_id = ?", args: [entryId] },
      ...valueStmts(entryId, values),
    ],
    "write"
  );
}

export async function deleteEntry(entryId) {
  await db.batch(
    [
      { sql: "DELETE FROM entry_values WHERE entry_id = ?", args: [entryId] },
      { sql: "DELETE FROM entries WHERE id = ?", args: [entryId] },
    ],
    "write"
  );
}

// Jeder einzelne Eintrag als Punkt auf der Zeitachse.
export async function history() {
  const { rows } = await db.execute(
    `SELECT en.date, en.created_at, en.id AS entry_id, v.option_id, v.value, v.note
     FROM entry_values v
     JOIN entries en ON en.id = v.entry_id
     JOIN options o ON o.id = v.option_id AND o.archived = 0
     ORDER BY en.created_at, en.id`
  );
  return rows.map((r) => ({
    entryId: Number(r.entry_id),
    date: r.date,
    createdAt: r.created_at,
    optionId: Number(r.option_id),
    value: Number(r.value),
    note: r.note,
  }));
}
