import path from "node:path";
import { existsSync } from "node:fs";

// Existing installs can keep their database and speech model in place.
export function localDirectory(root) {
  const current = path.join(root, ".jarvis");
  const legacy = path.join(root, ".dayfold");
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
