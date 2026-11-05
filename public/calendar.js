// Import a selected, concrete VEVENT or VTODO. Recurrences are deliberately
// left to the calendar provider rather than expanded into speculative tasks.
function localParts(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}
function timeAt(field) {
  const m = field.value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/,
  );
  if (!m) return "";
  const day = m[1] + "-" + m[2] + "-" + m[3];
  if (!m[4]) return day;
  const literal = day + "T" + m[4] + ":" + m[5] + ":" + (m[6] || "00");
  if (m[7]) return localParts(new Date(literal + "Z"));
  const zone = field.params.match(/(?:^|;)TZID="?([^";]+)"?/i)?.[1];
  if (!zone) return day + " " + m[4] + ":" + m[5];
  const target = Date.parse(literal + "Z");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const f = Object.fromEntries(
      formatter.formatToParts(guess).map((p) => [p.type, p.value]),
    );
    const offset =
      target -
      Date.parse(
        f.year +
          "-" +
          f.month +
          "-" +
          f.day +
          "T" +
          f.hour +
          ":" +
          f.minute +
          ":" +
          f.second +
          "Z",
      );
    guess += offset;
    if (!offset) break;
  }
  return localParts(new Date(guess));
}
export function readCalendar(raw) {
  if (!raw.includes("BEGIN:VCALENDAR"))
    throw Error("Choose an iCalendar (.ics) export.");
  const entries = [];
  let fields,
    kind,
    inner = 0;
  for (const line of raw
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")) {
    if (/^BEGIN:(VEVENT|VTODO)$/.test(line)) {
      kind = line.slice(6);
      fields = {};
      inner = 0;
      continue;
    }
    if (!fields) continue;
    if (line === "END:" + kind) {
      if (
        fields.SUMMARY &&
        fields.STATUS?.value !== "CANCELLED" &&
        (!fields.RRULE || fields["RECURRENCE-ID"])
      ) {
        const title = fields.SUMMARY.value;
        const deadline = kind === "VTODO" || /\b(deadline|due)\b/i.test(title);
        const eventTime = fields.DUE || fields.DTSTART;
        let when = "";
        try {
          if (eventTime) when = timeAt(eventTime);
        } catch {
          /* Unrecognized provider-specific timezone. Ask for the local date. */
        }
        const text =
          (deadline ? "Deadline: " : "") +
          title +
          (when
            ? (deadline ? " by " : " on ") + when.replace(" ", " at ")
            : "");
        entries.push({ title, text, when, deadline });
      }
      fields = null;
      continue;
    }
    if (line.startsWith("BEGIN:")) {
      inner++;
      continue;
    }
    if (line.startsWith("END:")) {
      inner = Math.max(inner - 1, 0);
      continue;
    }
    if (inner) continue;
    const match = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/i);
    if (match)
      fields[match[1].toUpperCase()] = {
        params: match[2],
        value: match[3].replace(/\\([nN,;\\])/g, (_, c) =>
          c.toLowerCase() === "n" ? "\n" : c,
        ),
      };
  }
  return entries;
}
