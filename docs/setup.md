# Optional setup

## Connect Anthropic

1. [Create an API key in the Claude Console](https://platform.claude.com/settings/keys). Your Anthropic API account needs available credit.
2. In the project folder, copy `.env.example` to `.env` if the file does not already exist. On Windows, use `Copy-Item .env.example .env` for a fresh install.
3. Open `.env` in a text editor. Paste the key after `ANTHROPIC_API_KEY=` and save. Keep `ANTHROPIC_MODEL=claude-haiku-4-5` or enter a Messages API model your account supports. Set `JARVIS_OWNER` to the name you use in meetings.
4. Restart the server. If you used the Windows background launcher, run `.\scripts\run-windows.ps1 -Restart`. For a foreground server, press Ctrl+C and run `node server.mjs` again.
5. Refresh the app. Choose **Claude** at the bottom of Capture, select **Email**, and submit a fresh message such as “Andy, could you get the volunteer roster over to me before noon tomorrow?” The resulting Activity entry should say **Claude**. Quick captures always use local rules.

The server reads the key from your environment or local `.env`. Git ignores that file. The public repository contains only an empty template. Each person running a clone supplies their own key for Claude mode. If GitHub or OneDrive sync is a concern, use a process environment variable and an unsynced data directory.

## Transcribe a meeting locally

On Windows x64, run `.\scripts\setup-windows.ps1 -Feature Speech`. This downloads a checksum-verified whisper.cpp binary and English speech model. Refresh the browser and choose **Meeting notes → Meeting audio → Transcribe sample → Process source**. Open the resulting activity and select **View meeting minutes**. The nine-second sample includes Andy’s assignment, Maya’s assignment, and a venue decision.

You can also choose an audio file, start the microphone, or share a browser tab with audio enabled. Live inputs depend on browser permissions. Microphone and tab capture are separate modes. Whisper transcribes short clips locally. Check speaker names before processing an unlabeled transcript. Other platforms can point `WHISPER_CLI` and `WHISPER_MODEL` at a compatible whisper.cpp installation.

## Enable /Todo: on Windows

Run `.\scripts\setup-windows.ps1 -Feature Shortcut` once and then double-click `desktop/start-shortcut.cmd` when you want capture enabled. Keep the Jarvis server running. In an ordinary text field, type **/Todo:** or **/todo** followed by Space. Without a text field, press **Ctrl+Alt+J**. Enter the task in the box and press Enter, or press Escape to cancel. Only submitted text goes to Jarvis, always locally and into **Personal workspace**. Return to the browser to see it. Exit the helper’s tray icon to disable it; relaunch it after signing in again. Protected or elevated apps can block the shortcut.

## Storage and verification

New installations use `.jarvis/workspace.sqlite`. Earlier installations reuse their existing data directory. Set `JARVIS_DATA_DIR` to choose another database location. Optional tools, personal data, and secrets are excluded from Git. The server listens on loopback, and every workspace change has a revision check so two windows cannot silently overwrite each other.

Run `node --test` for the local parser, replay, persistence, HTTP API, calendar parsing, and provider-contract tests. The Claude test uses a simulated reply. The fresh-email exercise above checks the live service with your account.
