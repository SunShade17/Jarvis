import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Ledger, checkedChanges, project } from "./lib/ledger.mjs";
import { localDirectory } from "./lib/paths.mjs";
import { localExtract, validDate } from "./lib/extract.mjs";
import { claudeExtract } from "./lib/claude.mjs";
import { examples, sourceTypes } from "./lib/scenario.mjs";
import { maxAudioBytes, speechTools, transcribe } from "./lib/speech.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const fail = (message, status = 400) =>
  Object.assign(Error(message), { status });
const clean = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const localDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const assets = new Map([
  ["/", "index.html"],
  ["/app.js", "app.js"],
  ["/audio.js", "audio.js"],
  ["/calendar.js", "calendar.js"],
  ["/style.css", "style.css"],
  ["/mark.svg", "mark.svg"],
  ["/sample-meeting.wav", "sample-meeting.wav"],
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
};

function sourceInput(data, owner) {
  if (!sourceTypes.includes(data?.type)) throw fail("Choose a valid source.");
  if (
    typeof data.text !== "string" ||
    !data.text.trim() ||
    data.text.length > 16000
  )
    throw fail("Enter between 1 and 16,000 characters.");
  const date = data.date || localDay();
  if (!validDate(date) || date.length !== 10)
    throw fail("Choose a valid source date.");
  return {
    type: data.type,
    text: data.text.trim(),
    date,
    label:
      clean(data.label, 100) ||
      {
        meeting: "Meeting notes",
        calendar: "Calendar entry",
        email: "Email",
        quick: "Quick capture",
      }[data.type],
    author:
      clean(data.author, 80) || (data.type === "email" ? "Sender" : owner),
  };
}
function buildEvent(source, items, tasks, engine) {
  const changes = checkedChanges(items, source, tasks);
  if (!changes.length)
    throw fail("No evidence was returned. Try a shorter excerpt.");
  // Repeated lines within the same source should create only one task.
  const titles = new Map();
  for (const change of changes) {
    if (change.kind !== "create") continue;
    const key =
      change.title.toLowerCase().replace(/\W+/g, " ").trim() +
      "|" +
      (change.due || "");
    if (titles.has(key)) {
      change.kind = "mention";
      change.target = titles.get(key);
    } else titles.set(key, change.id);
  }
  return { id: randomUUID(), source, engine, changes };
}
function seedDemo() {
  const events = [];
  for (const source of examples.slice(0, 3)) {
    const tasks = project(events).tasks;
    events.push(
      buildEvent(
        source,
        localExtract(source, tasks, "Andy"),
        tasks,
        "Local rules",
      ),
    );
  }
  return events;
}
async function readBody(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw fail("JSON required.", 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128000) throw fail("Source is too large.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks));
  } catch {
    throw fail("Invalid JSON.");
  }
}

export async function makeApp({ database, extractAI = claudeExtract } = {}) {
  if (!database) {
    const dir = process.env.JARVIS_DATA_DIR || process.env.DAYFOLD_DATA_DIR || localDirectory(root);
    await mkdir(dir, { recursive: true });
    database = path.join(dir, "workspace.sqlite");
  }
  const ledger = new Ledger(database);
  let transcribing = false;
  if (ledger.read("demo").version === 0) ledger.resetDemo(0, seedDemo());
  function view(space) {
    const state = ledger.read(space);
    const next = examples.findIndex((e) => !ledger.has(space, e.key));
    return {
      ...state,
      space,
      speechReady: Boolean(speechTools(root)),
      owner: space === "demo" ? "Andy" : process.env.JARVIS_OWNER || process.env.DAYFOLD_OWNER || "Andy",
      hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
      demo:
        space === "demo"
          ? {
              done: next === -1 ? examples.length : next,
              total: examples.length,
              next: next === -1 ? null : examples[next],
            }
          : null,
    };
  }
  async function mutation(body) {
    const { space, command, version } = body;
    if (!["demo", "personal"].includes(space)) throw fail("Unknown workspace.");
    const state = view(space);
    if (version !== state.version)
      throw fail("Your list changed. Refresh and try again.", 409);
    if (command === "undo") {
      if (!state.events.length) throw fail("Nothing to undo.");
      ledger.undo(space, version);
    } else if (command === "reset" && space === "demo") {
      ledger.resetDemo(version, seedDemo());
    } else if (command === "capture" || command === "next") {
      let source;
      if (command === "next") {
        if (space !== "demo" || !state.demo.next)
          throw fail("The example is complete.");
        source = examples[state.demo.done];
      } else source = sourceInput(body.source, state.owner);
      const key =
        source.key ||
        createHash("sha256")
          .update(
            JSON.stringify([
              source.type,
              source.author,
              source.date,
              source.text,
            ]),
          )
          .digest("hex");
      if (ledger.has(space, key))
        return { ...state, notice: "This source is already in your history." };
      const useAI = source.type !== "quick" && body.mode === "claude";
      if (useAI && !state.hasKey)
        throw fail("Set ANTHROPIC_API_KEY in .env and restart first.");
      const items = useAI
        ? await extractAI(source, state.tasks, state.owner)
        : localExtract(source, state.tasks, state.owner);
      const event = buildEvent(
        source,
        items,
        state.tasks,
        useAI ? "Claude" : "Local rules",
      );
      ledger.append(space, version, key, event);
    } else if (["add", "toggle", "resolve", "edit"].includes(command)) {
      const original =
        command === "resolve"
          ? state.pending.find((p) => p.id === body.review)
          : null;
      if (command === "resolve" && !original)
        throw fail("That review was already resolved.");
      const task = command !== "add" && state.tasks.find((t) => t.id === body.target);
      let kind =
        command === "toggle"
          ? task?.closed
            ? "reopen"
            : "close"
          : command === "edit"
            ? "edit"
            : command === "add" ? "create" : body.kind;
      if (
        ![
          "reopen",
          "create",
          "update",
          "close",
          "ignore",
          "mention",
          ...(command === "edit" ? ["edit"] : []),
        ].includes(kind)
      )
        throw fail("Choose a valid action.");
      if (command === "resolve" && kind === "reopen")
        throw fail("Use the completed list to reopen a task.");
      if (!["create", "ignore"].includes(kind) && !task)
        throw fail("Choose an existing task.");
      const due = body.due || null;
      if ((due && !validDate(due)) || (kind === "update" && !due))
        throw fail("Choose a valid deadline.");
      if (["add", "edit"].includes(command) && !clean(body.title, 180))
        throw fail("Enter a task title.");
      const title = clean(body.title, 180) || task?.title || original?.title;
      if (kind === "create" && !title) throw fail("Enter a task title.");
      const event = {
        id: randomUUID(),
        source: {
          type: "manual",
          date: localDay(),
          label: original ? "Review decision" : command === "add" ? "Task added" : "Task edited",
          text: original?.quote || title,
        },
        engine: "Manual",
        resolves: original?.id,
        changes: [
          {
            id: randomUUID(),
            kind,
            target: task?.id,
            title,
            due,
            quote: original?.quote || title,
            reason: original
              ? "Confirmed from " + original.source.label
              : "Changed in the task list.",
          },
        ],
      };
      ledger.append(space, version, event.id, event);
    } else throw fail("Unknown action.");
    return view(space);
  }
  const server = http.createServer(async (req, res) => {
    const json = (status, body) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    try {
      const host = req.headers.host || "";
      if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(host))
        throw fail("Local requests only.", 403);
      const url = new URL(req.url, "http://" + host);
      if (
        req.method === "POST" &&
        req.headers.origin &&
        req.headers.origin !== "http://" + host
      )
        throw fail("Different origin.", 403);
      if (req.method === "GET" && url.pathname === "/api/state") {
        const space = url.searchParams.get("space") || "demo";
        if (!["demo", "personal"].includes(space))
          throw fail("Unknown workspace.");
        return json(200, view(space));
      }
      if (req.method === "POST" && url.pathname === "/api/action")
        return json(200, await mutation(await readBody(req)));
      if (req.method === "POST" && url.pathname === "/api/transcribe") {
        const tools = speechTools(root);
        if (!tools) throw fail("Set up local Whisper first.", 503);
        if (transcribing)
          throw fail("A recording is already being transcribed.", 429);
        if (req.headers["content-type"] !== "audio/wav")
          throw fail("Audio must be sent as WAV.", 415);
        transcribing = true;
        try {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > maxAudioBytes)
              throw fail("Choose a clip of five minutes or less.", 413);
            chunks.push(chunk);
          }
          return json(200, {
            transcript: await transcribe(Buffer.concat(chunks), tools),
          });
        } finally {
          transcribing = false;
        }
      }
      if (req.method === "POST" && url.pathname === "/api/quick") {
        const input = await readBody(req);
        const result = await mutation({
          space: "personal",
          version: ledger.read("personal").version,
          command: "capture",
          source: { type: "quick", text: input.text, label: "Desktop capture" },
        });
        return json(200, {
          message: result.notice || "Saved to your personal workspace.",
        });
      }
      if (req.method === "GET" && assets.has(url.pathname)) {
        const file = assets.get(url.pathname);
        const content = await readFile(path.join(root, "public", file));
        res.writeHead(200, {
          "content-type": mime[path.extname(file)],
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        });
        return res.end(content);
      }
      json(404, { error: "Unknown route." });
    } catch (error) {
      json(error.status || 400, {
        error:
          error.name === "TimeoutError"
            ? "Claude timed out. Your list was not changed."
            : error.message,
      });
    }
  });
  server.on("close", () => ledger.db.close());
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT || 4317);
  const server = await makeApp();
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      "Jarvis is running at http://127.0.0.1:" + server.address().port,
    ),
  );
}
