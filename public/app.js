const view = document.getElementById("view");

const api = {
  options: () => fetch("/api/options").then((r) => r.json()),
  addOption: (name, color) =>
    fetch("/api/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    }).then((r) => r.json()),
  updateOption: (id, name, color) =>
    fetch(`/api/options/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    }).then((r) => r.json()),
  removeOption: (id) =>
    fetch(`/api/options/${id}`, { method: "DELETE" }).then((r) => r.json()),
  entry: (date) => fetch(`/api/entries/${date}`).then((r) => r.json()),
  saveEntry: (date, values) =>
    fetch(`/api/entries/${date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }).then((r) => r.json()),
  history: () => fetch("/api/history").then((r) => r.json()),
};

function todayStr() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
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

// --- Day view (Today, or any past day from History) ---

async function renderDay(date) {
  const isToday = date === todayStr();
  const [options, entry] = await Promise.all([api.options(), api.entry(date)]);
  const existing = new Map(entry.map((v) => [v.optionId, v]));
  const hasEntry = entry.length > 0;

  view.replaceChildren(
    el(
      "div",
      { class: "page-head" },
      el("h1", {}, isToday ? "Today" : formatDate(date)),
      isToday ? el("p", { class: "subtitle" }, formatDate(date)) : null
    )
  );

  if (options.length === 0) {
    view.append(
      el(
        "p",
        { class: "empty-hint" },
        "No entry options yet. Add some in Settings."
      )
    );
    return;
  }

  const form = el("div");

  function showForm() {
    form.replaceChildren();
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
        placeholder: "Add a note…",
      });
      note.value = current.note;
      inputs.push({ optionId: opt.id, slider, note });

      form.append(
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
          await api.saveEntry(
            date,
            inputs.map((i) => ({
              optionId: i.optionId,
              value: Number(i.slider.value),
              note: i.note.value.trim(),
            }))
          );
          saveBtn.disabled = false;
          saveBtn.classList.add("saved");
          saveBtn.textContent = "Saved ✓";
          setTimeout(() => {
            saveBtn.classList.remove("saved");
            saveBtn.textContent = "Save";
          }, 1600);
        },
      },
      "Save"
    );
    form.append(el("div", { class: "form-actions" }, saveBtn));
  }

  if (hasEntry) {
    showForm();
  } else {
    form.append(
      el(
        "div",
        { class: "empty-day" },
        el("button", { class: "big-plus", onclick: showForm, "aria-label": "New entry" }, "+"),
        el("p", {}, "How was your day?")
      )
    );
  }

  view.append(form);
}

// --- History ---

function smoothPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    // Catmull-Rom to cubic bezier
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

  const dates = [...new Set(history.map((h) => h.date))].sort();
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const t0 = new Date(dates[0] + "T12:00:00").getTime();
  const t1 = new Date(dates[dates.length - 1] + "T12:00:00").getTime();
  const span = Math.max(1, t1 - t0);
  const x = (date) =>
    dates.length === 1
      ? (W - pad.left - pad.right) / 2 + pad.left
      : pad.left +
        ((new Date(date + "T12:00:00").getTime() - t0) / span) *
          (W - pad.left - pad.right);
  const y = (v) => pad.top + (1 - v / 10) * (H - pad.top - pad.bottom);

  // horizontal guides at 0 / 5 / 10
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

  // x labels: first and last date
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
      undefined,
      { month: "short", day: "numeric" }
    );
    svg.append(label);
    if (dates.length === 1) break; // single date: one centered-ish label is enough
  }

  for (const opt of options) {
    const points = history
      .filter((h) => h.optionId === opt.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((h) => ({ x: +x(h.date).toFixed(1), y: +y(h.value).toFixed(1) }));
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
      el("h1", {}, "History"),
      el("p", { class: "subtitle" }, "Every day, at a glance")
    )
  );

  if (history.length === 0) {
    view.append(el("p", { class: "empty-hint" }, "No entries yet."));
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

  // day list, newest first
  const byDate = new Map();
  for (const h of history) {
    if (!byDate.has(h.date)) byDate.set(h.date, []);
    byDate.get(h.date).push(h);
  }
  const optName = new Map(options.map((o) => [o.id, o]));

  for (const date of [...byDate.keys()].sort().reverse()) {
    const values = byDate.get(date);
    const notes = values.filter((v) => v.note);
    view.append(
      el(
        "a",
        { class: "day-row", href: `#/day/${date}` },
        el("div", { class: "day-row-date" }, formatDate(date)),
        el(
          "div",
          { class: "day-row-values" },
          ...values.map((v) => {
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

// --- Settings ---

async function renderSettings() {
  const options = await api.options();

  view.replaceChildren(
    el(
      "div",
      { class: "page-head" },
      el("h1", {}, "Settings"),
      el("p", { class: "subtitle" }, "What do you want to track?")
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
              if (confirm(`Remove “${opt.name}”? Past entries stay in the database.`)) {
                await api.removeOption(opt.id);
                renderSettings();
              }
            },
          },
          "Remove"
        )
      )
    );
  }

  const newName = el("input", { type: "text", placeholder: "New option, e.g. Focus" });
  const add = async () => {
    if (!newName.value.trim()) return;
    await api.addOption(newName.value.trim(), randomWarmColor());
    renderSettings();
  };
  newName.addEventListener("keydown", (e) => e.key === "Enter" && add());
  view.append(
    el("div", { class: "add-row" }, newName, el("button", { class: "btn btn-secondary", onclick: add }, "Add")),
    el(
      "p",
      { class: "hint" },
      "Each option appears on the day page with a slider (0–10) and a note field."
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

window.addEventListener("hashchange", route);
route();
