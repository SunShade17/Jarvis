const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const verbs =
  "send|email|submit|print|review|finish|complete|draft|write|prepare|book|schedule|bring|upload|share|call|buy|pay|return|read|check|update|design|build|order|pick up|follow up|confirm|collect|deliver|fill out|hand in|make|research|invite|apply|file|organize|organise|contact|revise|publish|create";
const action = new RegExp("^(" + verbs + ")\\b", "i");
const aliases = {
  slides: "deck",
  presentation: "deck",
  slide: "deck",
  sponsors: "sponsor",
  copies: "copy",
  printouts: "copy",
  handout: "copy",
  submitting: "submit",
  email: "send",
  sent: "send",
  emailed: "send",
  shared: "send",
  share: "send",
  submitted: "submit",
  paid: "pay",
  booked: "book",
  finished: "finish",
  printed: "print",
};
const stop = new Set(
  "the a an to of for in on my your our their with by two one please myself i already have did it at is are now instead due deadline moved move postponed extended until still and can could you this that work".split(
    " ",
  ),
);
const tokenize = (text) =>
  text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.map((t) => aliases[t] || t)
    .filter((t) => !stop.has(t)) || [];
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const normalize = (s) => s.replace(/[’‘]/g, "'").replace(/[–—]/g, "-").trim();

export function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(value)
  )
    return false;
  const iso = value.slice(0, 10);
  const date = new Date(iso + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso
  );
}

export function readDue(text, reference) {
  const lower = text.toLowerCase().split(/\binstead of\b|\brather than\b/)[0];
  const base = new Date(reference + "T12:00:00Z");
  let day;
  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const named = lower.match(
    new RegExp(
      "\\b(" +
        months.join("|") +
        ")\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b",
    ),
  );
  if (iso) day = iso[1];
  else if (named)
    day = [
      named[3] || base.getUTCFullYear(),
      String(months.indexOf(named[1]) + 1).padStart(2, "0"),
      named[2].padStart(2, "0"),
    ].join("-");
  else {
    const dow = lower.match(new RegExp("\\b(" + weekdays.join("|") + ")\\b"));
    let offset;
    if (/\btomorrow\b/.test(lower)) offset = 1;
    else if (/\btoday\b|\btonight\b/.test(lower)) offset = 0;
    else if (dow)
      offset = (weekdays.indexOf(dow[1]) - base.getUTCDay() + 7) % 7;
    if (offset === undefined) return null;
    base.setUTCDate(base.getUTCDate() + offset);
    day = base.toISOString().slice(0, 10);
  }
  if (!validDate(day)) return null;
  const time = lower.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
  const clock = lower.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (time)
    return (
      day +
      "T" +
      String((Number(time[1]) % 12) + (time[3] === "pm" ? 12 : 0)).padStart(
        2,
        "0",
      ) +
      ":" +
      (time[2] || "00")
    );
  if (/\bnoon\b/.test(lower)) return day + "T12:00";
  if (clock) return day + "T" + clock[0];
  return day;
}

function titleOf(text) {
  const clean = text
    .replace(/^(?:(?:deadline|due|todo|action item|task)\s*[:\-]\s*)+/i, "")
    .replace(
      /\s+(?:by|due(?:\s+on)?|before|on|at)\s+(?:(?:next|this)\s+)?(?:\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|noon|january|february|march|april|may|june|july|august|september|october|november|december).*/i,
      "",
    )
    .replace(
      /\s+(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i,
      "",
    )
    .replace(/\s+due$/i, "")
    .replace(/[.!?,;:\s]+$/, "");
  return capitalize(clean.trim()).slice(0, 180);
}

// Match the words that identify the work. Sharing a project doesn't make
// "send the deck" and "print the deck" the same action.
export function candidates(text, tasks, requireSameAction) {
  const words = new Set(tokenize(text));
  const first = tokenize(text)[0];
  return tasks
    .map((task) => {
      const parts = tokenize(task.title);
      const primary = parts[0];
      if (requireSameAction && primary !== first) return { task, score: 0 };
      const objects = [...new Set(parts.slice(1))];
      const matches = objects.filter((word) => words.has(word)).length;
      const score = matches
        ? matches / Math.max(objects.length, 1) + (words.has(primary) ? 0.3 : 0)
        : 0;
      return { task, score };
    })
    .filter((x) => x.score >= 0.48)
    .sort((a, b) => b.score - a.score);
}

function classify(raw, source, tasks, owner, speaker) {
  let s = normalize(raw).replace(/^[\s•*-]+/, "");
  const cmd = s.match(/\/todo:\s*(.+)/i);
  const quick = Boolean(cmd) || source.type === "quick";
  if (cmd) s = cmd[1];
  const due = readDue(s, source.date);
  const base = { quote: raw.trim(), due, title: titleOf(s), target: null };
  const result = (kind, detail = {}) => ({ ...base, kind, ...detail });
  if (
    !quick &&
    source.type === "calendar" &&
    !/\b(due|deadline|hand.in|submission closes)\b/i.test(s)
  )
    return result("ignore", { reason: "Time reserved on the calendar." });
  const addressee = s.match(
    /^([\w'-]+),\s*(?=(?:please|can you|could you|would you)\b)/i,
  );
  if (!quick && addressee) {
    if (addressee[1].toLowerCase() !== owner.toLowerCase())
      return result("ignore", { reason: "Assigned to someone else." });
    s = s.slice(addressee[0].length);
  }
  if (
    !quick &&
    /\b(?:haven't|hasn't|not yet|didn't|not done|not complete)\b/i.test(s)
  )
    return result("ignore", {
      reason: "The source does not confirm completion.",
    });
  if (
    !quick &&
    /\b(?:do not|don't|never mind|no longer need to|cancel(?:led)?|already (?:sent|submitted|paid|booked|finished|printed)|(?:I|we) (?:sent|submitted|paid|booked|finished|printed)|has been (?:sent|submitted|paid)|is (?:done|complete))\b/i.test(
      s,
    )
  ) {
    const matches = candidates(
      s,
      tasks.filter((t) => !t.closed),
      false,
    );
    if (
      matches.length &&
      (!matches[1] || matches[0].score - matches[1].score > 0.18)
    )
      return result("close", { target: matches[0].task.id });
    return result("review", {
      reason: "Which open task does this finish or cancel?",
      intent: "close",
    });
  }
  if (
    !quick &&
    (/\b(?:instead|moved|move|push(?:ed)?|extend(?:ed)?|postponed|now due|new deadline|works for me|works better)\b/i.test(
      s,
    ) ||
      /\bworks instead\b/i.test(s))
  ) {
    const matches = candidates(
      s,
      tasks.filter((t) => !t.closed),
      false,
    );
    if (
      due &&
      matches.length &&
      (!matches[1] || matches[0].score - matches[1].score > 0.18)
    )
      return result("update", { target: matches[0].task.id });
    return result("review", {
      reason: "Choose the task whose deadline changed.",
      intent: "update",
    });
  }
  if (!quick) {
    const own = owner.toLowerCase();
    const will = s.match(
      /^([\w'-]+)\s+(?:will|should|needs to|has to|to)\s+(.+)/i,
    );
    if (will && will[1].toLowerCase() !== own && !/^(?:i|you)$/i.test(will[1]))
      return result("ignore", { reason: "Assigned to someone else." });
    if (
      /^i(?:'ll| will| need to| have to| can)\b/i.test(s) &&
      speaker.toLowerCase() !== own
    )
      return result("ignore", { reason: "The speaker owns this action." });
    if (will) s = will[2];
    s = s
      .replace(/^i(?:'ll| will| need to| have to| can)\s+/i, "")
      .replace(
        /^(?:(?:please|still|remember to)\s+|(?:could|can|would) you\s+)+/i,
        "",
      )
      .replace(/^(?:deadline|due|action item|task)\s*:\s*/i, "");
    if (!action.test(s) && source.type !== "calendar")
      return result("ignore", { reason: "No clear commitment to capture." });
  }
  const title = titleOf(s);
  if (!title) return result("ignore", { reason: "Empty capture." });
  if (
    !due &&
    /\b(?:due|deadline|by \d|by next|by end of|by the end of)\b/i.test(s)
  )
    return result("review", {
      title,
      reason: "Confirm the deadline before adding this task.",
      intent: "create",
    });
  const matches = candidates(title, tasks, true);
  const exact = tasks.find(
    (t) => tokenize(t.title).join(" ") === tokenize(title).join(" "),
  );
  const strong = matches.filter((x) => x.score >= 1 && !x.task.closed);
  if (exact || strong.length === 1) {
    const task = exact || strong[0].task;
    if (task.closed)
      return result("review", {
        title,
        reason: "Similar work was already closed. Create a new task if needed.",
        intent: "create",
      });
    if (due && task.due && due !== task.due)
      return result("review", {
        title,
        reason: "This source gives a different deadline. Confirm the change.",
        intent: "update",
      });
    return result(due && !task.due ? "update" : "mention", {
      title,
      target: task.id,
    });
  }
  if (strong.length > 1)
    return result("review", {
      title,
      reason: "Several tasks may match this action.",
      intent: "create",
    });
  return result("create", { title });
}

export function localExtract(source, tasks, owner) {
  let speaker = source.author || (source.type === "email" ? "Sender" : owner);
  const output = [];
  for (const line of source.text.split(/\r?\n/)) {
    let body = line.trim();
    if (!body) continue;
    if (source.type === "email") {
      if (
        /^On .+ wrote:$|^-{2,}\s*(?:Original Message|Forwarded message)|^--\s*$/.test(
          body,
        )
      )
        break;
      if (/^>|^(?:From|To|Cc|Sent|Date|Subject):/i.test(body)) continue;
    }
    const by = body.match(/^([\p{L}][\p{L} '-]{0,35}):\s+(.+)$/u);
    if (
      by &&
      source.type === "meeting" &&
      !/^(?:deadline|due|task|todo|action items?|decision|notes)$/i.test(by[1])
    ) {
      speaker = by[1];
      body = by[2];
    }
    const parts =
      source.type === "quick"
        ? [body]
        : body.split(/(?<=[.!?;])\s+(?=[A-Z/])|;\s*/);
    for (const part of parts.filter(Boolean))
      output.push(classify(part, source, tasks, owner, speaker));
  }
  return output;
}
