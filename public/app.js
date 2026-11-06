import { openAudio } from "./audio.js";
import { readCalendar } from "./calendar.js";
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  layers: '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  tasks:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m6 10 2 2 3-4m2 2h5m-12 6h12"/>',
  review: '<path d="m12 3 9 16H3zM12 8v5m0 3v.1"/>',
  activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  meeting:
    '<rect x="3" y="4" width="18" height="15" rx="3"/><path d="M7 9h10M7 13h6m-7 6v2l4-2"/>',
  email:
    '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3"/>',
  quick: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  manual: '<path d="m4 16 12-12 4 4L8 20H4zM14 6l4 4"/>',
  capture: '<path d="M4 7v13h14M8 4h12v12H8zM11 10h6m-3-3v6"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  flask:
    '<path d="M8 3h8m-6 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10"/>',
  route:
    '<circle cx="5" cy="7" r="2"/><circle cx="19" cy="17" r="2"/><path d="M7 7h8a3 3 0 0 1 0 6H9a2 2 0 0 0 0 4h8"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0m-7 7v5m-3 0h6"/>',
};
const icon = (name) =>
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  (paths[name] || "") +
  "</svg>";
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
const names = {
  meeting: "Meeting notes",
  email: "Email",
  calendar: "Calendar",
  quick: "Quick capture",
  manual: "Manual edit",
};
const labels = {
  create: "Created",
  update: "Deadline changed",
  mention: "Linked",
  close: "Closed",
  ignore: "Skipped",
  review: "Needs review",
  reopen: "Reopened",
  edit: "Edited",
};
const sample = {
  meeting:
    "Andy: I’ll draft the workshop agenda by Friday.\nMaya: I’ll book the meeting room.",
  email: "Could you please submit the volunteer roster by Friday at 4 pm?",
  calendar: "Deadline: Submit the economics assignment by Monday at 5 pm.",
  quick: "/Todo: Return the library book by Friday.",
};
const placeholder = {
  meeting: "Paste speaker-labeled notes or a meeting transcript…",
  email: "Paste an email request or deadline change…",
  calendar: "Paste a deadline or a calendar time block…",
  quick: "/Todo: What do you need to do?",
};
const descriptions = {
  tasks: "Your commitments, with the sources behind them.",
  review: "Resolve unclear assignments or deadline changes.",
  activity: "Every source and the changes it made to your list.",
};
const viewNames = {
  tasks: "My tasks",
  review: "Needs review",
  activity: "Activity",
};
const params = new URLSearchParams(location.search);
let space = params.has("quick")
  ? "personal"
  : localStorage.getItem("jarvis-space") || localStorage.getItem("dayfold-space") || "demo";
if (!["personal", "demo"].includes(space)) space = "demo";
let state,
  view = "tasks",
  tab = "open",
  busy = false,
  toastTimer;
const drafts = new Map();
const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
const fmt = (value) => {
  if (!value) return "No deadline";
  const date = new Date(value.includes("T") ? value : value + "T12:00");
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(value.includes("T") ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
};
const chip = (type) =>
  '<span class="chip ' +
  esc(type) +
  '">' +
  icon(type) +
  esc(names[type]) +
  "</span>";
function toast(text) {
  clearTimeout(toastTimer);
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4500);
}
function formError(text = "") {
  let el = $("form-error");
  if (!el) {
    el = document.createElement("p");
    el.id = "form-error";
    el.className = "form-error";
    el.setAttribute("role", "alert");
    $("capture-form").append(el);
  }
  el.textContent = text;
}
async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(Error(data.error || "Request failed."), {
      status: res.status,
    });
  return data;
}
async function reload() {
  state = await api("/api/state?space=" + space);
  $("space").value = space;
  const saved = localStorage.getItem("jarvis-mode") || localStorage.getItem("dayfold-mode");
  $("engine-mode").value =
    state.hasKey && saved !== "local" ? "claude" : "local";
  $("engine-mode").querySelector("[value=claude]").disabled = !state.hasKey;
  render();
}
async function change(command, details = {}) {
  if (busy) return false;
  busy = true;
  formError();
  render();
  try {
    const data = await api("/api/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command,
        space,
        version: state.version,
        mode: $("engine-mode").value,
        ...details,
      }),
    });
    const before = state;
    state = data;
    const latest = state.events.at(-1);
    const message =
      data.notice ||
      (["capture", "next"].includes(command) && latest
        ? captureResult(latest, before.tasks)
        : "Workspace updated");
    toast(message);
    return true;
  } catch (error) {
    if (error.status === 409) await reload();
    formError(error.message);
    toast(error.message);
    return false;
  } finally {
    busy = false;
    render();
  }
}
function captureResult(event, previous) {
  const first=event.changes[0];
  const task=previous.find(t=>t.id===first.target);
  if(first.kind==='update' && task) return task.title+' · '+fmt(task.due)+' → '+fmt(first.due);
  if(first.kind==='ignore' && event.changes.length===1) return first.reason || 'Source saved. No task added.';
  if(first.kind==='close' && task) return 'Closed: '+task.title+(event.changes.length>1?' · '+summary(event):'');
  return event.source.label+' · '+summary(event);
}
function summary(event) {
  const counts = new Map();
  for (const c of event.changes)
    counts.set(c.kind, (counts.get(c.kind) || 0) + 1);
  return [...counts]
    .map(([k, n]) => n + " " + (labels[k] || k).toLowerCase())
    .join(" · ");
}
function navButton(action, id, title, glyph, count) {
  return (
    '<button class="nav-btn ' +
    (action === "view" && id === view ? "active" : "") +
    '" data-act="' +
    action +
    '" data-id="' +
    id +
    '">' +
    icon(glyph) +
    esc(title) +
    (count == null ? "" : '<span class="nav-num">' + count + "</span>") +
    "</button>"
  );
}
function activityRow(event) {
  return (
    '<button class="activity-row" data-act="event" data-id="' +
    event.id +
    '"><span class="chip source-square ' +
    event.source.type +
    '">' +
    icon(event.source.type) +
    '</span><span class="activity-text"><strong>' +
    esc(event.source.label) +
    "</strong><small>" +
    esc(summary(event)) +
    '</small></span><span class="activity-count">' +
    esc(event.engine) +
    '</span><span class="chevron">' +
    icon("chevron") +
    "</span></button>"
  );
}
function taskRow(task) {
  const types = [
    ...new Set(task.history.map((h) => h.type).filter((t) => t !== "manual")),
  ];
  return (
    '<article class="task-card ' +
    (task.closed ? "finished" : "") +
    '"><button class="check ' +
    (task.closed ? "done" : "") +
    '" data-act="toggle" data-id="' +
    task.id +
    '" aria-label="' +
    esc((task.closed ? "Reopen " : "Complete ") + task.title) +
    '">' +
    (task.closed ? icon("check") : "") +
    "</button>" +
    '<button class="task-main" data-act="task" data-id="' +
    task.id +
    '"><span class="task-name">' +
    esc(task.title) +
    '</span><span class="task-meta">' +
    types.map(chip).join("") +
    (task.due
      ? '<span class="due">' + icon("calendar") + esc(fmt(task.due)) + "</span>"
      : "") +
    '</span></button><button class="chevron" aria-label="View task history" data-act="task" data-id="' +
    task.id +
    '">' +
    icon("chevron") +
    "</button></article>"
  );
}
const empty = (title, detail) =>
  '<div class="empty"><h3>' +
  esc(title) +
  "</h3><p>" +
  esc(detail) +
  "</p></div>";
function render() {
  if (!state) return;
  const open = state.tasks.filter((t) => !t.closed),
    done = state.tasks.filter((t) => t.closed);
  $("nav").innerHTML =
    navButton("view", "tasks", "My tasks", "tasks", open.length) +
    navButton(
      "view",
      "review",
      "Needs review",
      "review",
      state.pending.length,
    ) +
    navButton("view", "activity", "Activity", "activity");
  $("sources").innerHTML = Object.entries(names)
    .filter(([k]) => k !== "manual")
    .map(([k, n]) => navButton("source", k, n, k))
    .join("");
  $("owner").textContent = state.owner;
  $("avatar").textContent = state.owner[0].toUpperCase();
  $("heading").textContent = $("crumb").textContent = viewNames[view];
  $("subtitle").textContent = descriptions[view];
  const d = state.demo;
  $("walkthrough").innerHTML = d
    ? '<section class="walk"><div class="walk-icon">' +
      icon("route") +
      '</div><div class="walk-text"><strong>Demo walkthrough</strong>' +
      (d.next ? '<span class="next-source">' + esc(names[d.next.type]) + ' · ' + (d.done+1) + '/' + d.total + '</span><p>“' + esc(d.next.text) + '”' :
        '<p>All seven sources processed. Explore a task’s history or restart.') +
      '</p><div class="walk-steps" aria-label="' +
      d.done +
      " of " +
      d.total +
      ' sources processed">' +
      Array.from(
        { length: d.total },
        (_, i) => '<i class="' + (i < d.done ? "on" : "") + '"></i>',
      ).join("") +
      '</div></div><div class="walk-actions">' +
      (d.next
        ? '<button class="outline" data-act="next">Process next ' +
          icon("arrow") +
          "</button>"
        : "") +
      '<button class="icon-btn" data-act="reset" aria-label="Restart demo" title="Restart demo">' +
      icon("undo") +
      "</button></div></section>"
    : "";
  if (view === "tasks") {
    const tasks = (tab === "open" ? open : done)
      .slice()
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    $("list").innerHTML =
      '<div class="panel-head task-toolbar"><h2>Task list</h2><button class="small-btn" data-act="add">+ Add task</button><div class="seg" aria-label="Task status"><button class="' +
      (tab === "open" ? "sel" : "") +
      '" data-act="tab" data-id="open">Open ' +
      open.length +
      '</button><button class="' +
      (tab === "closed" ? "sel" : "") +
      '" data-act="tab" data-id="closed">Closed ' +
      done.length +
      "</button></div></div>" +
      '<div class="task-list">' +
      (tasks.map(taskRow).join("") ||
        empty(
          tab === "open" ? "No open tasks" : "No closed tasks",
          tab === "open"
            ? "Add a task yourself or capture one from a source."
            : "Completed commitments appear here.",
        )) +
      "</div>" +
      '<div class="section-head"><span class="section-label">Recent activity</span><button class="link-btn" data-act="view" data-id="activity">View all</button></div><div class="activity-box">' +
      (state.events.slice(-3).reverse().map(activityRow).join("") ||
        '<p class="fine">Your first capture will appear here.</p>') +
      "</div>";
  } else if (view === "activity") {
    $("list").innerHTML =
      '<div class="panel-head"><h2>Source history</h2><button class="small-btn" data-act="undo" ' +
      (!state.events.length ? "disabled" : "") +
      ">" +
      icon("undo") +
      'Undo latest</button></div><div class="activity-box">' +
      (state.events.slice().reverse().map(activityRow).join("") ||
        empty("No sources yet", "Process a source to see its effects here.")) +
      "</div>";
  } else {
    $("list").innerHTML =
      '<div class="panel-head"><h2>Review queue</h2></div>' +
      (state.pending
        .map(
          (p) =>
            '<article class="review-card">' +
            chip(p.source.type) +
            "<h3>" +
            esc(p.reason || "Confirm a suggested change") +
            "</h3><p>“" +
            esc(p.quote) +
            '”</p><button class="small-btn" data-act="review" data-id="' +
            p.id +
            '">Review change ' +
            icon("arrow") +
            "</button></article>",
        )
        .join("") ||
        empty(
          "All caught up",
          "Ambiguous changes will wait here for your decision.",
        ));
  }
  $("submit").disabled = busy;
  $("submit").innerHTML =
    icon("capture") + (busy ? "Working…" : "Process source");
  $("space").disabled = busy;
  $("engine-mode").disabled = busy;
  if (busy)
    document
      .querySelectorAll(
        '[data-act="next"],[data-act="toggle"],[data-act="reset"],[data-act="undo"]',
      )
      .forEach((btn) => (btn.disabled = true));
}
function modal(title, body) {
  $("dialog-content").innerHTML =
    '<div class="modal-header"><h2>' +
    esc(title) +
    '</h2><button type="button" class="icon-btn" data-act="dismiss" aria-label="Close dialog">' +
    icon("close") +
    '</button></div><div class="modal-body">' +
    body +
    "</div>";
  if (!$("dialog").open) $("dialog").showModal();
}
function eventModal(event) {
  const changes = event.changes
    .map(
      (c) =>
        "<article><strong>" +
        esc(labels[c.kind]) +
        '</strong><div class="fine">' +
        esc(c.reason || c.title) +
        (c.kind === "update" ? " · " + esc(fmt(c.due)) : "") +
        "</div><blockquote>" +
        esc(c.quote) +
        "</blockquote></article>",
    )
    .join("");
  modal(
    event.source.label,
    '<div class="task-meta">' +
      chip(event.source.type) +
      "<span>" +
      esc(event.engine) +
      " · " +
      esc(fmt(event.source.date)) +
      '</span></div><div class="timeline">' +
      changes +
      '</div><p class="section-label">Original source</p><div class="source-text">' +
      esc(event.source.text) +
      "</div>" +
      (event.source.type === "meeting"
        ? '<p><button class="small-btn" data-act="minutes" data-id="' +
          event.id +
          '">' +
          icon("meeting") +
          "View meeting minutes</button></p>"
        : ""),
  );
}
function taskModal(task) {
  modal(
    task.title,
    '<div class="task-meta"><span class="due">' +
      esc(task.closed ? "Closed" : "Open") +
      '</span><span class="due">' +
      icon("calendar") +
      esc(fmt(task.due)) +
      '</span><button class="link-btn" data-act="edit" data-id="' +
      task.id +
      '">Edit task</button></div><div class="timeline">' +
      task.history
        .slice()
        .reverse()
        .map(
          (h) =>
            "<article><strong>" +
            esc(labels[h.kind]) +
            "</strong>" +
            (["update", "create", "edit"].includes(h.kind) && h.due
              ? " · " + esc(fmt(h.due))
              : "") +
            '<div class="fine">' +
            esc(h.label) +
            "</div><blockquote>" +
            esc(h.quote) +
            '</blockquote><button class="link-btn" data-act="event" data-id="' +
            h.eventId +
            '">Open source</button></article>',
        )
        .join("") +
      "</div>",
  );
}
function editTask(task = {}) {
  const adding = !task.id;
  modal(
    adding ? "Add task" : "Edit task",
    '<form id="edit-form" class="modal-form"><label class="label" for="edit-title">Task title</label><input id="edit-title" required maxlength="180" value="' +
      esc(task.title) +
      '"><label class="label" for="edit-date">Deadline (optional)</label><input id="edit-date" type="date" value="' +
      esc(task.due?.slice(0, 10)) +
      '"><label class="label" for="edit-time">Time (optional)</label><input id="edit-time" type="time" value="' +
      esc(task.due?.slice(11)) +
      '"><button class="primary">' + (adding ? "Add task" : "Save changes") + '</button><p class="form-error" role="alert" id="edit-error"></p></form>',
  );
  $("edit-title").focus();
  $("edit-form").onsubmit = async (e) => {
    e.preventDefault();
    const date = $("edit-date").value,
      time = $("edit-time").value;
    if (time && !date) {
      $("edit-error").textContent = "Choose a date for this time.";
      $("edit-date").focus();
      return;
    }
    if (
      await change(adding ? "add" : "edit", {
        target: task.id,
        title: $("edit-title").value,
        due: date ? date + (time ? "T" + time : "") : null,
      })
    ) {
      if (adding) { tab = "open"; render(); toast("Task added"); }
      $("dialog").close();
    } else $("edit-error").textContent = $("form-error").textContent;
  };
}
function minutes(event) {
  const lines = event.source.text
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const decisions = lines.filter((s) =>
    /\b(decided|agreed|decision|approved|settled on|chose)\b/i.test(s),
  );
  const follow = event.changes.filter(
    (c) => !["ignore", "review"].includes(c.kind),
  );
  const others = event.changes.filter(
    (c) =>
      c.kind === "ignore" && /speaker|someone else|assigned/i.test(c.reason),
  );
  const bullets = (items, fallback) =>
    items.length
      ? '<ul class="minutes">' +
        items.map((s) => "<li>" + esc(s) + "</li>").join("") +
        "</ul>"
      : '<p class="fine">' + fallback + "</p>";
  modal(
    "Meeting minutes",
    '<p class="fine">' +
      esc(event.source.label) +
      " · " +
      esc(fmt(event.source.date)) +
      '</p><p class="section-label">Decisions mentioned</p>' +
      bullets(decisions, "No explicit decisions identified.") +
      '<p class="section-label">Your follow-ups</p>' +
      bullets(
        follow.map((c) => c.title + (c.due ? " · " + fmt(c.due) : "")),
        "No confirmed follow-ups.",
      ) +
      '<p class="section-label">Other assignments</p>' +
      bullets(
        others.map(
          (c) => lines.find((line) => line.includes(c.quote)) || c.quote,
        ),
        "No other assignments identified.",
      ) +
      '<button class="link-btn" data-act="event" data-id="' +
      event.id +
      '">Back to original notes</button>',
  );
}
function reviewModal(id) {
  const p = state.pending.find((item) => item.id === id);
  if (!p) return;
  modal(
    "Review change",
    "<p>" +
      esc(p.reason) +
      "</p><blockquote>" +
      esc(p.quote) +
      '</blockquote><form id="resolve-form" class="modal-form"><label class="label" for="resolution">Action</label><select id="resolution"><option value="update">Change deadline</option><option value="close">Close task</option><option value="create">Create task</option><option value="mention">Link to task</option><option value="ignore">Dismiss suggestion</option></select><div id="target-field"><label class="label" for="target">Open task</label><select id="target"><option value="">Choose a task…</option>' +
      state.tasks
        .filter((t) => !t.closed)
        .map(
          (t) => '<option value="' + t.id + '">' + esc(t.title) + "</option>",
        )
        .join("") +
      '</select></div><div id="title-field"><label class="label" for="review-title">Task title</label><input id="review-title" maxlength="180" value="' +
      esc(p.title) +
      '"></div><div id="due-field"><label class="label" for="review-due">Deadline</label><input id="review-due" type="date" value="' +
      esc(p.due?.slice(0, 10)) +
      '"><label class="label" for="review-time">Time (optional)</label><input id="review-time" type="time" value="' +
      esc(p.due?.slice(11)) +
      '"></div><button class="primary">Apply decision</button><p id="review-error" class="form-error"></p></form>',
  );
  $("resolution").value = ["update", "create", "close"].includes(p.intent)
    ? p.intent
    : "create";
  const fields = () => {
    const kind = $("resolution").value;
    $("target-field").hidden = !["update", "close", "mention"].includes(kind);
    $("target").required = !$("target-field").hidden;
    $("title-field").hidden = kind !== "create";
    $("review-title").required = kind === "create";
    $("due-field").hidden = !["update", "create"].includes(kind);
    $("review-due").required = kind === "update";
  };
  fields();
  $("resolution").onchange = fields;
  $("resolve-form").onsubmit = async (e) => {
    e.preventDefault();
    const date = $("review-due").value,
      time = $("review-time").value;
    if (
      await change("resolve", {
        review: id,
        kind: $("resolution").value,
        target: $("target").value,
        due: date ? date + (time ? "T" + time : "") : null,
        title: $("review-title").value,
      })
    )
      $("dialog").close();
    else $("review-error").textContent = $("form-error").textContent;
  };
}
function selectSource(type, focus = false) {
  $("source-type").value = type;
  $("source-icon").innerHTML = icon(type);
  $("body-label").textContent = {
    meeting: "Notes or transcript",
    email: "Email text",
    calendar: "Event details",
    quick: "Your task",
  }[type];
  $("body").placeholder = placeholder[type];
  $("author").placeholder =
    type === "email" ? "Sender" : state?.owner || "Andy";
  $("dictate").hidden = type !== "meeting";
  $("import-calendar").hidden = type !== "calendar";
  $("shortcut-help").hidden = type !== "quick";
  if (focus) {
    $("capture").scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("body").focus();
  }
}
function stash() {
  drafts.set(space, {
    type: $("source-type").value,
    text: $("body").value,
    label: $("source-label").value,
    date: $("source-date").value,
    author: $("author").value,
  });
}
function restore() {
  const saved = drafts.get(space) || {};
  selectSource(saved.type || "meeting");
  $("body").value = saved.text || "";
  $("source-label").value = saved.label || "";
  $("author").value = saved.author || "";
  $("source-date").value = saved.date || today();
  formError();
}
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn || !state) return;
  const { act, id } = btn.dataset;
  if (act === "view") {
    view = id;
    render();
  }
  if (act === "tab") {
    tab = id;
    render();
  }
  if (act === "source") selectSource(id, true);
  if (act === "add" && !busy) editTask();
  if (act === "next") await change("next");
  if (act === "toggle") await change("toggle", { target: id });
  if (act === "task") taskModal(state.tasks.find((t) => t.id === id));
  if (act === "edit") editTask(state.tasks.find((t) => t.id === id));
  if (act === "event") eventModal(state.events.find((ev) => ev.id === id));
  if (act === "review") reviewModal(id);
  if (act === "minutes") minutes(state.events.find((ev) => ev.id === id));
  if (act === "dismiss") $("dialog").close();
  if (act === "undo" || act === "reset") {
    modal(
      act === "reset" ? "Restart the demo?" : "Undo the latest change?",
      act === "reset"
        ? "<p>Restore the three opening tasks in the demo workspace. Your personal workspace is separate.</p>"
        : "<p>Remove the latest source or edit and restore the previous task list.</p>",
    );
    const ok = document.createElement("button");
    ok.className = "primary";
    ok.textContent = act === "reset" ? "Restart demo" : "Undo change";
    $("dialog-content").append(ok);
    ok.onclick = async () => {
      if (await change(act)) $("dialog").close();
    };
  }
});
$("dialog").addEventListener("click", (e) => {
  if (e.target === $("dialog")) $("dialog").close();
});
$("source-type").onchange = () => selectSource($("source-type").value);
$("jump-capture").onclick = () => selectSource($("source-type").value, true);
$("import-calendar").onclick = () => $("calendar-file").click();
$("calendar-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw Error("Choose a calendar export smaller than 5 MB.");
    const entries = readCalendar(await file.text());
    if (!entries.length)
      throw Error(
        "This file has no standalone events or tasks. Paste the relevant occurrence instead.",
      );
    modal(
      "Choose a calendar entry",
      '<p class="fine">Times are shown in this browser’s timezone. Review the event before processing.</p><div class="activity-box">' +
        entries
          .map(
            (entry, i) =>
              '<button class="activity-row" data-entry="' +
              i +
              '"><span class="chip source-square calendar">' +
              icon("calendar") +
              '</span><span class="activity-text"><strong>' +
              esc(entry.title) +
              "</strong><small>" +
              esc(entry.when || "Check deadline manually") +
              "</small></span></button>",
          )
          .join("") +
        "</div>",
    );
    $("dialog-content")
      .querySelectorAll("[data-entry]")
      .forEach(
        (btn) =>
          (btn.onclick = () => {
            const entry = entries[Number(btn.dataset.entry)];
            $("body").value = entry.text;
            $("source-label").value = entry.title;
            $("dialog").close();
            $("body").focus();
          }),
      );
  } catch (error) {
    formError(error.message);
  } finally {
    $("calendar-file").value = "";
  }
};
$("shortcut-help").onclick = () =>
  modal(
    "Desktop capture",
    '<p>On Windows, run <code>desktop/start-shortcut.cmd</code> while Jarvis is running. Type <strong>/Todo:</strong> or <strong>/todo</strong> then Space in a text field. Without a text field, press <strong>Ctrl + Alt + J</strong>.</p><p>Type your task in the box and press Enter to save it to your Personal workspace. Escape cancels.</p><p class="fine">First-time setup is in the README. Exit the AutoHotkey tray icon to turn capture off.</p>',
  );
$("example").onclick = () => {
  const type = $("source-type").value;
  $("body").value = sample[type].replace(/^Andy:/, state.owner + ":");
  $("body").focus();
};
$("space").onchange = async () => {
  if (busy) return;
  stash();
  space = $("space").value;
  localStorage.setItem("jarvis-space", space);
  view = "tasks";
  tab = "open";
  await reload();
  restore();
};
$("engine-mode").onchange = () =>
  localStorage.setItem("jarvis-mode", $("engine-mode").value);
$("engine-info").onclick = () =>
  modal(
    "Extraction engine",
    '<p><strong>Local rules</strong> run entirely on this computer. They recognize explicit assignments, deadlines, and common follow-ups. Unfamiliar phrasing can be missed.</p><p><strong>Claude</strong> interprets free-form language. When selected, it receives the submitted source and compact task context. Quick captures always use local rules.</p><p class="fine">Enable Claude by setting ANTHROPIC_API_KEY in the server’s .env file and restarting Jarvis.</p>',
  );
$("capture-form").onsubmit = async (e) => {
  e.preventDefault();
  const source = {
    type: $("source-type").value,
    text: $("body").value,
    author: $("author").value,
    date: $("source-date").value,
    label: $("source-label").value,
  };
  if (await change("capture", { source })) {
    $("body").value = "";
    $("source-label").value = "";
    if (state.events.at(-1)?.changes.some((c) => c.kind === "review")) {
      view = "review";
      render();
    }
  }
};
$("dictate").innerHTML = icon("mic") + "Meeting audio";
$("dictate").onclick = () =>
  openAudio({
    modal,
    ready: state.speechReady,
    append: (text) => {
      $("body").value += ($("body").value ? "\n" : "") + text;
      $("body").focus();
      toast("Transcript ready. Review the text, then process the source.");
    },
  });
window.addEventListener("focus", async () => {
  if (!state || busy || $("dialog").open) return;
  const previous = space;
  try {
    const fresh = await api("/api/state?space=" + space);
    if (!busy && space === previous && fresh.version >= state.version) {
      state = fresh;
      render();
    }
  } catch {
    /* A failed refresh leaves the last saved list visible. */
  }
});
try {
  await reload();
  restore();
  if (params.has("quick")) {
    selectSource("quick", true);
    $("body").value = "/Todo: ";
  }
} catch (error) {
  formError("Could not open this workspace: " + error.message);
}
