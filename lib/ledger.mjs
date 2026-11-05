import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { validDate } from "./extract.mjs";

export function project(events) {
  const tasks = new Map();
  const pending = new Map();
  for (const event of events) {
    const reviewed = pending.get(event.resolves);
    if (event.resolves) pending.delete(event.resolves);
    for (const change of event.changes) {
      const evidence = {
        eventId: reviewed?.eventId || event.id,
        label: reviewed?.source.label || event.source.label,
        type: reviewed?.source.type || event.source.type,
        date: event.source.date,
        ...change,
      };
      if (change.kind === "review") {
        pending.set(change.id, {
          ...change,
          eventId: event.id,
          source: event.source,
        });
      } else if (change.kind === "create") {
        tasks.set(change.id, {
          id: change.id,
          title: change.title,
          due: change.due,
          closed: false,
          history: [evidence],
        });
      } else if (change.kind !== "ignore" && tasks.has(change.target)) {
        const task = tasks.get(change.target);
        if (change.kind === "update" && change.due) task.due = change.due;
        if (change.kind === "edit") {
          task.title = change.title;
          task.due = change.due;
        }
        if (change.kind === "close" || change.kind === "reopen")
          task.closed = change.kind === "close";
        task.history.push(evidence);
      }
    }
  }
  return { tasks: [...tasks.values()], pending: [...pending.values()], events };
}

const operations = new Set([
  "create",
  "update",
  "close",
  "mention",
  "ignore",
  "review",
]);
export function checkedChanges(items, source, tasks) {
  if (!Array.isArray(items) || items.length > 180)
    throw Error("Split this source into shorter entries.");
  return items.map((item) => {
    if (
      !operations.has(item.kind) ||
      typeof item.quote !== "string" ||
      !item.quote.trim() ||
      !source.text.includes(item.quote.trim())
    ) {
      throw Error(
        "A proposed change had no matching source quote. Try a shorter passage.",
      );
    }
    let {
      kind,
      target = null,
      due = null,
      reason = "",
      intent = "create",
    } = item;
    const title = String(item.title || item.quote)
      .trim()
      .slice(0, 180);
    if (due && !validDate(due)) throw Error("A proposed deadline was invalid.");
    if (
      ["update", "close", "mention"].includes(kind) &&
      !tasks.some((t) => t.id === target && !t.closed)
    ) {
      intent = kind === "mention" ? "create" : kind;
      kind = "review";
      reason = "Choose which open task this source refers to.";
      target = null;
    }
    if (kind === "update" && !due) {
      kind = "review";
      intent = "update";
      reason = "Confirm the new deadline.";
    }
    if (kind === "update" || kind === "close") {
      const task = tasks.find((t) => t.id === target);
      const latest = task?.history
        .filter((h) => ["create", "update", "edit", "reopen"].includes(h.kind))
        .at(-1);
      if (latest && latest.date > source.date) {
        intent = kind;
        kind = "review";
        reason =
          "This source predates a newer task change. Check which information applies.";
      }
    }
    return {
      id: randomUUID(),
      kind,
      title,
      due: due || null,
      quote: item.quote.trim(),
      target,
      reason: String(reason).slice(0, 300),
      intent,
    };
  });
}

export class Ledger {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, space TEXT NOT NULL, source_key TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(space, source_key)); CREATE TABLE IF NOT EXISTS revisions (space TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0);",
    );
    for (const space of ["demo", "personal"])
      this.db
        .prepare("INSERT OR IGNORE INTO revisions(space) VALUES (?)")
        .run(space);
  }
  read(space) {
    const rows = this.db
      .prepare("SELECT body FROM events WHERE space=? ORDER BY seq")
      .all(space);
    const rev = this.db
      .prepare("SELECT version FROM revisions WHERE space=?")
      .get(space);
    return {
      ...project(rows.map((r) => JSON.parse(r.body))),
      version: rev.version,
    };
  }
  has(space, key) {
    return Boolean(
      this.db
        .prepare("SELECT 1 FROM events WHERE space=? AND source_key=?")
        .get(space, key),
    );
  }
  append(space, version, key, event) {
    this.change(space, version, () =>
      this.db
        .prepare("INSERT INTO events(space, source_key, body) VALUES (?,?,?)")
        .run(space, key, JSON.stringify(event)),
    );
  }
  change(space, version, write) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare("SELECT version FROM revisions WHERE space=?")
        .get(space).version;
      if (existing !== version)
        throw Object.assign(
          Error(
            "The list changed in another window. Check the new list and try again.",
          ),
          { status: 409 },
        );
      write();
      this.db
        .prepare("UPDATE revisions SET version=version+1 WHERE space=?")
        .run(space);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  undo(space, version) {
    this.change(space, version, () =>
      this.db
        .prepare(
          "DELETE FROM events WHERE seq=(SELECT MAX(seq) FROM events WHERE space=?)",
        )
        .run(space),
    );
  }
  resetDemo(version, events) {
    this.change("demo", version, () => {
      this.db.prepare("DELETE FROM events WHERE space='demo'").run();
      for (const event of events)
        this.db
          .prepare(
            "INSERT INTO events(space,source_key,body) VALUES ('demo',?,?)",
          )
          .run(event.source.key, JSON.stringify(event));
    });
  }
}
