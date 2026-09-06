# LoreHub

Your personal, cloud-synced library of AI config files — inside VS Code.

LoreHub keeps the Markdown files you use to configure AI coding tools
(`CLAUDE.md`, `SKILL.md`, `.cursorrules`, `AGENTS.md`, …) in one place, tied to
your account rather than to one machine. Organize them with labels, then load
any of them straight into the repository you are working on without leaving the
editor.

> **Status: pre-release.** This extension is not published to the VS Code
> Marketplace yet. The code here is complete for the initial feature set and is
> being prepared for its first listing.

## Features

- **Cloud-synced library** — sign in with GitHub; your files follow you to any
  machine and any repository.
- **Write or import** — create Markdown from scratch in the editor panel, or
  import an existing file from disk.
- **Labels** — assign as many labels as you like to a file, then filter the
  list by them. Label counts are always visible, so a growing collection stays
  legible.
- **Search** — filter by title or filename, on top of label filtering.
- **Load into a project** — write a file into your workspace, choosing the
  destination each time. If the target already exists, LoreHub opens a diff
  before overwriting.
- **Offline-aware** — cached files stay readable when the network is down;
  writes are disabled until you are back online.

## Requirements

- VS Code `^1.104.0`
- A Supabase project (the extension stores your library there)

## Development

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL and anon key
npm run compile
```

Press <kbd>F5</kbd> to launch the Extension Development Host, then run
**LoreHub: Open My md Files** from the Command Palette.

To run against a local Supabase stack:

```bash
supabase start
supabase migration up
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run compile` | Development build |
| `npm run watch` | Rebuild on change |
| `npm run package` | Production build |
| `npm run check-types` | `tsc --noEmit` |
| `npm run lint` | ESLint |

### Architecture

The extension is a single WebView panel (`src/webview/`) talking to the
extension host over a typed message protocol (`src/webview/protocol.ts`), which
in turn calls Supabase through the service layer (`src/auth/`, `src/md/`,
`src/label/`, `src/load/`). All access control lives in Postgres Row Level
Security — see `supabase/migrations/`.

## License

[MIT](./LICENSE). Bundled dependencies are listed in
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
