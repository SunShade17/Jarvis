import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { localDirectory } from "./paths.mjs";

const run = promisify(execFile);
export const maxAudioBytes = 44 + 16000 * 2 * 300;
export function speechTools(root) {
  const dir = path.join(localDirectory(root), "tools");
  const model =
    process.env.WHISPER_MODEL || path.join(dir, "ggml-tiny.en-q5_1.bin");
  const exe =
    process.env.WHISPER_CLI ||
    ["Release", "bin", ""]
      .map((folder) => path.join(dir, "whisper", folder, "whisper-cli.exe"))
      .find((p) => existsSync(p));
  return exe && existsSync(exe) && existsSync(model) ? { exe, model } : null;
}
export function validateAudio(wav) {
  if (
    wav.length < 46 ||
    wav.length > maxAudioBytes ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE" ||
    wav.toString("ascii", 12, 16) !== "fmt " ||
    wav.readUInt16LE(20) !== 1 ||
    wav.readUInt16LE(22) !== 1 ||
    wav.readUInt32LE(24) !== 16000 ||
    wav.readUInt16LE(34) !== 16 ||
    wav.toString("ascii", 36, 40) !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44
  )
    throw Error(
      "Use a recording up to five minutes long. Jarvis expects mono 16 kHz PCM.",
    );
}
export async function transcribe(wav, tools) {
  validateAudio(wav);
  const dir = await mkdtemp(path.join(os.tmpdir(), "jarvis-audio-"));
  const input = path.join(dir, "meeting.wav"),
    output = path.join(dir, "transcript");
  try {
    await writeFile(input, wav);
    await run(
      tools.exe,
      [
        "-m",
        tools.model,
        "-f",
        input,
        "-l",
        "en",
        "-t",
        "4",
        "-otxt",
        "-of",
        output,
        "-nt",
      ],
      { timeout: 180000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    );
    const text = (await readFile(output + ".txt", "utf8")).trim();
    if (!text) throw Error("empty");
    return text;
  } catch {
    throw Error(
      "Could not transcribe this recording. Try a shorter clip with clear English speech.",
    );
  } finally {
    await Promise.all(
      [unlink(input), unlink(output + ".txt")].map((work) =>
        work.catch((err) => {
          if (err.code !== "ENOENT") throw err;
        }),
      ),
    );
    await rmdir(dir);
  }
}
