// Fixed reference dates keep the interview walkthrough repeatable.
export const examples = [
  {
    type: "meeting",
    label: "Partnerships check-in",
    date: "2026-11-02",
    text: "Andy: I’ll send the sponsor deck to Maya by Thursday.\nMaya: I’ll book the room for the workshop.",
  },
  {
    type: "calendar",
    label: "Workshop deadline",
    date: "2026-11-02",
    text: "Deadline: Submit the workshop abstract by Friday at 5 pm.",
  },
  {
    type: "quick",
    label: "Personal note",
    date: "2026-11-02",
    text: "/Todo: Review the venue shortlist by Wednesday.",
  },
  {
    type: "calendar",
    label: "Prep block",
    date: "2026-11-03",
    text: "Wednesday, 3–4 pm: Work on the sponsor deck.",
    preview: "A calendar block sets aside time to work on the deck.",
  },
  {
    type: "email",
    label: "Maya · Deck timing",
    date: "2026-11-04",
    text: "Quick update: the sponsor slides are now due Friday at noon instead of Thursday.",
    preview: "Maya moves the deck deadline in an email.",
  },
  {
    type: "quick",
    label: "Print reminder",
    date: "2026-11-04",
    text: "/Todo: Print two copies of the sponsor deck by Friday.",
    preview: "A quick capture adds a separate job for the same project.",
  },
  {
    type: "email",
    label: "Maya · Deck sent",
    date: "2026-11-05",
    text: "I already sent the sponsor deck to the partners myself. Please still print two copies of the sponsor deck by Friday.",
    preview: "Maya sends the deck herself. You still owe the printouts.",
  },
].map((item, i) => ({
  ...item,
  key: "scenario-" + i,
  author: item.type === "email" ? "Maya" : "Andy",
}));

export const sourceTypes = ["meeting", "email", "calendar", "quick"];
