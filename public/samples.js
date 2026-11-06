// The follow-up refers to the meeting. Use fixed source dates so the pair can
// be replayed on any day and relative deadlines still mean the same thing.
export function captureExamples(owner = "Andy") {
  return {
    meeting: {label: "Repair Café · Friday check-in", date: "2026-11-06", author: "Maya",
      text: [
        "Maya: The library gave us the ground floor for Saturday. Last time people queued at the wrong door.",
        owner + ": I'll send the entrance map to volunteers by Monday at noon.",
        owner + ": I'll print the repair intake forms by Thursday.",
        "Priya: I'll bring the spare soldering irons from the lab.",
        owner + ": I'll confirm the first-aid kit location with the library by Tuesday.",
        "Maya: Agreed. Let's keep one table free for walk-ins."
      ].join("\n")
    },
    email: {label: "Repair Café · library update", date: "2026-11-09", author: "Maya",
      text: [
        "Subject: Repair Café — hold the map until we hear back",
        "", "Hi " + owner + ",", "",
        "The library found a leak by the south doors. The entrance map is now due Wednesday at 3 pm. That gives facilities a day to confirm which door we can use.",
        "I already printed the repair intake forms while I was at the library.",
        "Could you email the accessibility coordinator by Tuesday at noon? She needs a head count for the lift.",
        "Please bring the blue extension cord on Saturday. The outlet by the check-in desk is farther away than it looks.",
        "", "Thanks,", "Maya"
      ].join("\n")
    }
  };
}
