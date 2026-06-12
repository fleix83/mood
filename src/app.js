import * as api from "./db.js";

const view = document.getElementById("view");

function todayStr() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// Lokaler Zeitstempel ohne Zeitzone, passend zum lokalen Datum.
function nowStr() {
  const d = new Date();
  return (
    todayStr() +
    "T" +
    [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":")
  );
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("de-CH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

// --- Tagesansicht (Heute oder ein Tag aus dem Verlauf) ---

async function renderDay(date) {
  const isToday = date === todayStr();
  const [options, entries] = await Promise.all([
    api.options(),
    api.entriesForDay(date),
  ]);
  const optById = new Map(options.map((o) => [o.id, o]));

  view.replaceChildren(
    el(
      "div",
      { class: "page-head" },
      el("h1", {}, isToday ? "Heute" : formatDate(date)),
      isToday ? el("p", { class: "subtitle" }, formatDate(date)) : null
    )
  );

  if (options.length === 0) {
    view.append(
      el(
        "p",
        { class: "empty-hint" },
        "Noch keine Optionen. Füge welche in den Einstellungen hinzu."
      )
    );
    return;
  }

  // Formular für einen Eintrag: ohne entry → neuer Eintrag, sonst bearbeiten.
  function entryForm(entry) {
    const wrap = el("div", { class: "entry-form" });
    const existing = new Map((entry?.values || []).map((v) => [v.optionId, v]));
    const inputs = [];

    for (const opt of options) {
      const current = existing.get(opt.id) || { value: 5, note: "" };
      const valueLabel = el("span", { class: "option-value" }, String(current.value));
      const slider = el("input", {
        type: "range",
        min: "0",
        max: "10",
        step: "1",
        value: String(current.value),
        oninput: () => (valueLabel.textContent = slider.value),
      });
      const note = el("textarea", {
        class: "note-field",
        rows: "2",
        placeholder: "Notiz hinzufügen …",
      });
      note.value = current.note;
      inputs.push({ optionId: opt.id, slider, note });

      wrap.append(
        el(
          "div",
          { class: "card" },
          el(
            "div",
            { class: "option-head" },
            el(
              "span",
              { class: "option-name" },
              el("span", { class: "dot", style: `background:${opt.color}` }),
              opt.name
            ),
            valueLabel
          ),
          slider,
          el("div", { class: "range-labels" }, el("span", {}, "0"), el("span", {}, "10")),
          note
        )
      );
    }

    const saveBtn = el(
      "button",
      {
        class: "btn",
        onclick: async () => {
          saveBtn.disabled = true;
          const values = inputs.map((i) => ({
            optionId: i.optionId,
            value: Number(i.slider.value),
            note: i.note.value.trim(),
          }));
          if (entry) await api.updateEntry(entry.id, values);
          else await api.addEntry(date, nowStr(), values);
          renderDay(date);
        },
      },
      "Speichern"
    );
    wrap.append(
      el(
        "div",
        { class: "form-actions" },
        el("button", { class: "btn-ghost", onclick: () => renderDay(date) }, "Abbrechen"),
        saveBtn
      )
    );
    return wrap;
  }

  // Gespeicherter Eintrag als kompakte Karte mit Uhrzeit.
  function entryCard(entry) {
    const card = el(
      "div",
      { class: "card entry-card" },
      el(
        "div",
        { class: "entry-head" },
        el("span", { class: "entry-time" }, formatTime(entry.createdAt) + " Uhr"),
        el(
          "span",
          { class: "entry-actions" },
          el(
            "button",
            {
              class: "btn-ghost",
              onclick: () => card.replaceWith(entryForm(entry)),
            },
            "Bearbeiten"
          ),
          el(
            "button",
            {
              class: "btn-ghost",
              onclick: async () => {
                if (confirm("Diesen Eintrag löschen?")) {
                  await api.deleteEntry(entry.id);
                  renderDay(date);
                }
              },
            },
            "Löschen"
          )
        )
      ),
      el(
        "div",
        { class: "day-row-values" },
        ...entry.values.map((v) => {
          const opt = optById.get(v.optionId);
          return el(
            "span",
            {},
            el("span", { class: "dot", style: `background:${opt?.color || "#ccc"}` }),
            `${opt?.name || "?"} ${v.value}`
          );
        })
      ),
      ...entry.values
        .filter((v) => v.note)
        .map((v) =>
          el(
            "div",
            { class: "day-row-note" },
            `${optById.get(v.optionId)?.name || ""}: ${v.note}`
          )
        )
    );
    return card;
  }

  for (const entry of entries) view.append(entryCard(entry));

  // Neue Einträge nur auf dem aktuellen Tag.
  if (isToday) {
    if (entries.length === 0) {
      const empty = el(
        "div",
        { class: "empty-day" },
        el(
          "button",
          {
            class: "big-plus",
            onclick: () => empty.replaceWith(entryForm(null)),
            "aria-label": "Neuer Eintrag",
          },
          "+"
        ),
        el("p", {}, "Wie war dein Tag?")
      );
      view.append(empty);
    } else {
      const addBtn = el(
        "button",
        {
          class: "btn btn-secondary add-entry",
          onclick: () => addBtn.replaceWith(entryForm(null)),
        },
        "+ Neuer Eintrag"
      );
      view.append(addBtn);
    }
  } else if (entries.length === 0) {
    view.append(el("p", { class: "empty-hint" }, "Keine Einträge an diesem Tag."));
  }
}

// --- Verlauf ---

function smoothPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    // Catmull-Rom zu kubischem Bezier
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildChart(options, history) {
  const W = 600;
  const H = 280;
  const pad = { top: 16, right: 16, bottom: 30, left: 30 };

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // Jeder Eintrag ist ein Punkt, positioniert nach seinem Zeitstempel.
  const times = history.map((h) => new Date(h.createdAt).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const span = Math.max(1, t1 - t0);
  const single = t1 === t0;
  const x = (t) =>
    single
      ? (W - pad.left - pad.right) / 2 + pad.left
      : pad.left + ((t - t0) / span) * (W - pad.left - pad.right);
  const y = (v) => pad.top + (1 - v / 10) * (H - pad.top - pad.bottom);

  // Hilfslinien bei 0 / 5 / 10
  for (const v of [0, 5, 10]) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", pad.left);
    line.setAttribute("x2", W - pad.right);
    line.setAttribute("y1", y(v));
    line.setAttribute("y2", y(v));
    line.setAttribute("stroke", "#ece5da");
    line.setAttribute("stroke-width", "1");
    svg.append(line);
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", pad.left - 8);
    label.setAttribute("y", y(v) + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#8a8378");
    label.textContent = String(v);
    svg.append(label);
  }

  // x-Beschriftung: erstes und letztes Datum
  const dates = [...new Set(history.map((h) => h.date))].sort();
  for (const [date, anchor, xpos] of [
    [dates[0], "start", pad.left],
    [dates[dates.length - 1], "end", W - pad.right],
  ]) {
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", xpos);
    label.setAttribute("y", H - 8);
    label.setAttribute("text-anchor", anchor);
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#8a8378");
    label.textContent = new Date(date + "T12:00:00").toLocaleDateString(
      "de-CH",
      { month: "short", day: "numeric" }
    );
    svg.append(label);
    if (single || dates.length === 1) break;
  }

  for (const opt of options) {
    const points = history
      .filter((h) => h.optionId === opt.id)
      .map((h) => ({ t: new Date(h.createdAt).getTime(), v: h.value }))
      .sort((a, b) => a.t - b.t)
      .map((p) => ({ x: +x(p.t).toFixed(1), y: +y(p.v).toFixed(1) }));
    if (points.length === 0) continue;

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", smoothPath(points));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", opt.color);
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);

    for (const p of points) {
      const c = document.createElementNS(svgNS, "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", "3.5");
      c.setAttribute("fill", opt.color);
      svg.append(c);
    }
  }

  return svg;
}

async function renderHistory() {
  const [options, history] = await Promise.all([api.options(), api.history()]);

  view.replaceChildren(
    el(
      "div",
      { class: "page-head" },
      el("h1", {}, "Verlauf"),
      el("p", { class: "subtitle" }, "Alle Einträge auf einen Blick")
    )
  );

  if (history.length === 0) {
    view.append(el("p", { class: "empty-hint" }, "Noch keine Einträge."));
    return;
  }

  const legend = el(
    "div",
    { class: "legend" },
    ...options.map((opt) =>
      el(
        "span",
        { class: "legend-item" },
        el("span", { class: "dot", style: `background:${opt.color}` }),
        opt.name
      )
    )
  );

  view.append(el("div", { class: "chart-card" }, legend, buildChart(options, history)));

  // Liste aller Einträge, neueste zuerst, gruppiert nach Tag.
  const byEntry = new Map();
  for (const h of history) {
    if (!byEntry.has(h.entryId)) {
      byEntry.set(h.entryId, {
        id: h.entryId,
        date: h.date,
        createdAt: h.createdAt,
        values: [],
      });
    }
    byEntry.get(h.entryId).values.push(h);
  }
  const optName = new Map(options.map((o) => [o.id, o]));

  const entriesDesc = [...byEntry.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id
  );

  let lastDate = null;
  let dayBox = null;
  for (const entry of entriesDesc) {
    if (entry.date !== lastDate) {
      lastDate = entry.date;
      dayBox = el(
        "a",
        { class: "day-row", href: `#/day/${entry.date}` },
        el("div", { class: "day-row-date" }, formatDate(entry.date))
      );
      view.append(dayBox);
    }
    const notes = entry.values.filter((v) => v.note);
    dayBox.append(
      el(
        "div",
        { class: "entry-row" },
        el("div", { class: "entry-time" }, formatTime(entry.createdAt) + " Uhr"),
        el(
          "div",
          { class: "day-row-values" },
          ...entry.values.map((v) => {
            const opt = optName.get(v.optionId);
            return el(
              "span",
              {},
              el("span", { class: "dot", style: `background:${opt?.color || "#ccc"}` }),
              `${opt?.name || "?"} ${v.value}`
            );
          })
        ),
        ...notes.map((v) =>
          el("div", { class: "day-row-note" }, `${optName.get(v.optionId)?.name || ""}: ${v.note}`)
        )
      )
    );
  }
}

// --- Einstellungen ---

async function renderSettings() {
  const options = await api.options();

  view.replaceChildren(
    el(
      "div",
      { class: "page-head" },
      el("h1", {}, "Einstellungen"),
      el("p", { class: "subtitle" }, "Was möchtest du erfassen?")
    )
  );

  for (const opt of options) {
    const color = el("input", {
      type: "color",
      value: opt.color,
      onchange: () => api.updateOption(opt.id, name.value.trim() || opt.name, color.value),
    });
    const name = el("input", {
      type: "text",
      value: opt.name,
      onchange: () => {
        if (name.value.trim()) api.updateOption(opt.id, name.value.trim(), color.value);
        else name.value = opt.name;
      },
    });
    view.append(
      el(
        "div",
        { class: "settings-row" },
        color,
        name,
        el(
          "button",
          {
            class: "btn-ghost",
            onclick: async () => {
              if (confirm(`„${opt.name}“ entfernen? Frühere Einträge bleiben erhalten.`)) {
                await api.removeOption(opt.id);
                renderSettings();
              }
            },
          },
          "Entfernen"
        )
      )
    );
  }

  const newName = el("input", { type: "text", placeholder: "Neue Option, z. B. Fokus" });
  const add = async () => {
    if (!newName.value.trim()) return;
    await api.addOption(newName.value.trim(), randomWarmColor());
    renderSettings();
  };
  newName.addEventListener("keydown", (e) => e.key === "Enter" && add());
  view.append(
    el("div", { class: "add-row" }, newName, el("button", { class: "btn btn-secondary", onclick: add }, "Hinzufügen")),
    el(
      "p",
      { class: "hint" },
      "Jede Option erscheint auf der Tagesseite mit einem Regler (0–10) und einem Notizfeld."
    )
  );
}

const WARM_COLORS = ["#d08c60", "#a3b18a", "#8e9aaf", "#c9787a", "#b08968", "#9c89b8", "#e0a458"];
function randomWarmColor() {
  return WARM_COLORS[Math.floor(Math.random() * WARM_COLORS.length)];
}

// --- Router ---

function route() {
  const hash = location.hash || "#/";
  let routeName = "today";
  if (hash.startsWith("#/day/")) {
    routeName = "history";
    renderDay(hash.slice(6));
  } else if (hash === "#/history") {
    routeName = "history";
    renderHistory();
  } else if (hash === "#/settings") {
    routeName = "settings";
    renderSettings();
  } else {
    renderDay(todayStr());
  }
  document
    .querySelectorAll(".nav a")
    .forEach((a) => a.classList.toggle("active", a.dataset.route === routeName));
}

async function main() {
  try {
    await api.init();
  } catch (err) {
    console.error(err);
    view.replaceChildren(
      el("p", { class: "empty-hint" }, err.message || "Verbindung zur Datenbank fehlgeschlagen.")
    );
    return;
  }
  window.addEventListener("hashchange", route);
  route();
}

main();
