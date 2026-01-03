# Copilot / AI agent instructions for energozbut-infobot

This file gives concise, actionable guidance for AI coding agents working in this repository.

Quick summary
- Project: Firebase Cloud Functions (mainly JavaScript), with a TypeScript starter in `functions/src`.
- Runtime: Node 22 (see `functions/package.json` -> `engines.node`).
- Bot: Telegram bot built with `telegraf`, served via Express and deployed as a Firebase HTTP function (`exports.bot = onRequest(app)`).

Key files & code patterns
- Entry (JS): `functions/index.js` — loads `.env`, initializes `Telegraf`, mounts `bot.webhookCallback('/webhook')`, and exports `bot` as a v2 `onRequest` function.
- Commands: `functions/commands/*.js` — each file should export a function that receives the `bot` instance, e.g. `module.exports = bot => { bot.start(...) }` (see `functions/commands/start.js`). AI agents should follow this exact export pattern when adding commands.
- TypeScript scaffold: `functions/src/index.ts` — contains examples for v2 triggers; this is a template and not used at runtime (package.json `main` is `index.js`).
- Manifest & workflows: `functions/package.json`, top-level `package.json`, and `firebase.json` control scripts, predeploy hooks and linting.

Developer workflows (concrete commands)
- Install deps (from repo root or in `functions`):
  - `npm install` or `npm --prefix functions install`
- Run functions emulator (local dev):
  - `npm --prefix functions run serve`  # runs `firebase emulators:start --only functions`
  - or `npm --prefix functions run shell` for `firebase functions:shell`.
- Lint (and predeploy):
  - `npm --prefix functions run lint` (also run automatically by `firebase.json` predeploy).
- Deploy functions:
  - `npm --prefix functions run deploy`  # runs `firebase deploy --only functions` from `functions` package script

Environment & secrets
- `functions/index.js` calls `require('dotenv').config()` so place environment variables in `functions/.env` during local development. For production, use Firebase environment configuration or CI secrets; do NOT commit `.env`.
- Key env var: `BOT_TOKEN` (used by `Telegraf` in `functions/index.js`).

Common conventions to follow (observed in repo)
- Use CommonJS modules in runtime JS files under `functions/` (the loader in `index.js` expects `require` and `module.exports`).
- Command modules: export a single function accepting `bot` and attach handlers there. If a command file doesn't export a function, `index.js` logs a warning.
- Keep runtime code in `functions/` root (the `source` in `firebase.json` points to `functions`).
- Tests/dev-only helpers: `firebase-functions-test` is present in `devDependencies` — follow existing patterns when adding tests.
- ESLint: repo uses `eslint` with `eslint-config-google`; run `npm --prefix functions run lint` before deploy.

Integration notes for AI agents
- When adding or modifying commands, update only files under `functions/commands/` and follow the `module.exports = (bot) => { ... }` shape.
- Do not change `functions/package.json` `main` unless intentionally switching runtime entry point — runtime depends on `index.js`.
- If editing TypeScript in `functions/src`, confirm build/compile steps are added; currently no build script is present, so TS files act as examples.
- Respect `firebase.json` predeploy steps (lint), and ensure changes pass linting locally using the commands above.

Examples (explicit)
- Add a new command: create `functions/commands/help.js` exporting a function that registers handlers on the passed `bot`.
- Start emulator: `npm --prefix functions run serve` then POST updates to `/webhook` path or configure Telegraf webhook to point to emulator URL.

If something seems missing
- Ask a human for where secrets are stored in production (Firebase project config vs CI). If adding TypeScript compilation, propose a small build step and confirm desired output path.

Feedback request
- If any patterns above are incorrect or you want examples expanded (tests, CI, deployment targets), tell me which area to expand.
