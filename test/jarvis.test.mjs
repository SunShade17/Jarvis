import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { makeApp } from "../server.mjs";
import { examples } from "../lib/scenario.mjs";
import { localExtract, readDue, validDate } from "../lib/extract.mjs";
import { checkedChanges, project, Ledger } from "../lib/ledger.mjs";
import { claudeExtract } from "../lib/claude.mjs";
import { readCalendar } from "../public/calendar.js";
import { validateAudio } from "../lib/speech.mjs";

const asSource = (text, type = "meeting") => ({
  text,
  type,
  author: type === "email" ? "Maya" : "Andy",
  date: "2026-11-02",
  label: "Test source",
});
function replay(sources) {
  const events = [];
  for (const source of sources) {
    const tasks = project(events).tasks;
    events.push({
      id: String(events.length),
      source,
      changes: checkedChanges(
        localExtract(source, tasks, "Andy"),
        source,
        tasks,
      ),
    });
  }
  return project(events);
}
test("the seven-source interview replay keeps ownership, changes the deadline and closes only sending", () => {
  const state = replay(examples);
  assert.deepEqual(
    state.events.map((e) => e.changes.map((c) => c.kind)),
    [
      ["create", "ignore"],
      ["create"],
      ["create"],
      ["ignore"],
      ["update"],
      ["create"],
      ["close", "mention"],
    ],
  );
  assert.equal(state.tasks.length, 4);
  assert.equal(
    state.tasks.find((t) => t.closed).title,
    "Send the sponsor deck to Maya",
  );
  assert.equal(state.tasks.find((t) => t.closed).due, "2026-11-06T12:00");
  assert.equal(state.pending.length, 0);
});
test("relative deadlines use the source date, and dates without a time stay all-day", () => {
  assert.equal(readDue("by tomorrow at 5pm", "2026-12-31"), "2027-01-01T17:00");
  assert.equal(
    readDue("Friday instead of Thursday", "2026-11-02"),
    "2026-11-06",
  );
  assert.equal(
    readDue("November 9, 2026 at noon", "2026-11-02"),
    "2026-11-09T12:00",
  );
  assert.equal(readDue("by 2026-02-30", "2026-01-02"), null);
  assert.equal(validDate("2026-11-06T24:30"), false);
});
test("quoted email history, ordinary events, and other people’s requests stay off the list", () => {
  const state = replay([
    asSource(
      "From: Maya\nAndy, please submit the budget by Friday.\n> Please send the draft by Tuesday.\nOn Monday Maya wrote:\nPlease buy ten badges.",
      "email",
    ),
    asSource("Maya, please book the room.", "email"),
    asSource("Budget planning meeting on Friday", "calendar"),
  ]);
  assert.deepEqual(
    state.tasks.map((t) => t.title),
    ["Submit the budget"],
  );
});
test("time-only deadline and an ambiguous pronoun are sent to review", () => {
  const state = replay([
    asSource("Please submit the budget due by 5pm.", "email"),
    asSource("Friday works instead.", "email"),
  ]);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.pending.length, 2);
});
test("older updates and repeat references to a closed task require review", () => {
  const state = replay([
    examples[0],
    examples[4],
    { ...examples[4], date: "2026-11-01" },
    examples[6],
    examples[0],
  ]);
  assert.equal(state.tasks[0].due, "2026-11-06T12:00");
  assert.equal(state.tasks[0].closed, true);
  assert.equal(state.pending.length, 2);
});
test("model responses need an exact quote and valid date; unknown targets go to review", () => {
  const source = asSource("Move it to Friday.");
  assert.throws(() =>
    checkedChanges(
      [{ kind: "close", quote: "Invented evidence." }],
      source,
      [],
    ),
  );
  assert.throws(() =>
    checkedChanges(
      [{ kind: "create", quote: source.text, due: "Friday" }],
      source,
      [],
    ),
  );
  const [change] = checkedChanges(
    [{ kind: "close", quote: source.text, target: "absent" }],
    source,
    [],
  );
  assert.equal(change.kind, "review");
});
test("Claude uses the tool response and only sends compact context", async () => {
  const source = asSource("Please submit the budget.");
  const result = await claudeExtract(
    source,
    [
      {
        id: "t",
        title: "Review abstract",
        due: null,
        closed: false,
        history: [{ label: "Notes", quote: "PRIVATE_OLD_TRANSCRIPT" }],
      },
    ],
    "Andy",
    async (url, req) => {
      const body = JSON.parse(req.body);
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(body.tool_choice.name, "record_changes");
      assert.ok(!req.body.includes("PRIVATE_OLD_TRANSCRIPT"));
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: "tool_use",
              name: "record_changes",
              input: {
                changes: [
                  {
                    kind: "create",
                    quote: source.text,
                    title: "Submit budget",
                  },
                ],
              },
            },
          ],
        }),
      };
    },
  );
  assert.equal(result[0].title, "Submit budget");
  await assert.rejects(
    claudeExtract(source, [], "Andy", async () => ({ ok: false, status: 401 })),
    /401/,
  );
});
test("calendar imports preserve dates, unfolding and concrete entries and omit alarms and recurring masters", () => {
  const raw =
    "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Deadline - Submit pro\n posal\nDTSTART;VALUE=DATE:20261106\nBEGIN:VALARM\nSUMMARY:Wrong\nEND:VALARM\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:Weekly class\nRRULE:FREQ=WEEKLY\nEND:VEVENT\nEND:VCALENDAR";
  const [entry, ...others] = readCalendar(raw);
  assert.equal(others.length, 0);
  const state = replay([asSource(entry.text, "calendar")]);
  assert.equal(state.tasks[0].title, "Submit proposal");
  assert.equal(state.tasks[0].due, "2026-11-06");
});
test("sample WAV is suitable for the local speech engine", async () => {
  validateAudio(
    await readFile(new URL("../public/sample-meeting.wav", import.meta.url)),
  );
  assert.throws(() => validateAudio(Buffer.alloc(30)));
});
test("SQLite persists events on disk and rejects an out-of-date write", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "jarvis-test-")),
    file = path.join(dir, "test.sqlite");
  const db = new Ledger(file);
  db.append("personal", 0, "key", {
    id: "e",
    source: examples[0],
    changes: [],
  });
  assert.throws(() => db.undo("personal", 0), /changed/);
  db.db.close();
  const reopened = new Ledger(file);
  assert.equal(reopened.read("personal").events.length, 1);
  reopened.db.close();
  await unlink(file);
  await rmdir(dir);
});

test("HTTP flow isolates demo, deduplicates, resolves ambiguity, edits, undoes, and rejects cross-origin writes", async () => {
  const server = await makeApp({ database: ":memory:" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const get = async (space) =>
    (await fetch(base + "/api/state?space=" + space)).json();
  const post = (route, body, extra = {}) =>
    fetch(base + route, {
      method: "POST",
      headers: { "content-type": "application/json", ...extra },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await get("demo")).tasks.length, 3);
    let state = await get("personal");
    async function act(command, detail = {}) {
      const res = await post("/api/action", {
        space: "personal",
        version: state.version,
        command,
        ...detail,
      });
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      state = body;
    }
    const source = asSource(
      "/Todo: Write interview outline by Friday.",
      "quick",
    );
    await act("capture", { source });
    const id = state.tasks[0].id,
      version = state.version;
    await act("capture", { source });
    assert.equal(state.version, version);
    await act("capture", {
      source: asSource("Monday works instead.", "email"),
    });
    assert.equal(state.pending.length, 1);
    await act("resolve", {
      review: state.pending[0].id,
      kind: "update",
      target: id,
      due: "2026-11-09T12:00",
    });
    assert.equal(state.tasks[0].due, "2026-11-09T12:00");
    await act("edit", {
      target: id,
      title: "Prepare interview outline",
      due: null,
    });
    assert.equal(state.tasks[0].title, "Prepare interview outline");
    await act("undo");
    assert.equal(state.tasks[0].due, "2026-11-09T12:00");
    await act("toggle", { target: id });
    assert.equal(state.tasks[0].closed, true);
    await act("undo");
    assert.equal(state.tasks[0].closed, false);
    const stale = await post("/api/action", {
      command: "undo",
      space: "personal",
      version: 0,
    });
    assert.equal(stale.status, 409);
    const foreign = await post(
      "/api/quick",
      { text: "Do this" },
      { origin: "https://another.example" },
    );
    assert.equal(foreign.status, 403);
    assert.equal(
      (await post("/api/quick", { text: "/Todo: Return adapter" })).status,
      200,
    );
    assert.equal((await get("personal")).tasks.length, 2);
    const demo = await get("demo");
    await post("/api/action", {
      space: "demo",
      command: "reset",
      version: demo.version,
    });
    assert.equal((await get("personal")).tasks.length, 2);
    assert.equal((await fetch(base + "/.env")).status, 404);
    const html = await fetch(base + "/");
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Jarvis/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
