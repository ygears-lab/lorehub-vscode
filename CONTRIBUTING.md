# Contributing

Bug reports and feature requests are welcome in
[Issues](https://github.com/ygears-lab/lorehub-vscode/issues).

## Setup

```bash
npm install
cp .env.example .env   # fill in your Supabase URL and anon key
npm run compile
```

Press <kbd>F5</kbd> to launch the Extension Development Host, then run
**LoreHub: Open My Library** from the Command Palette.

To run against a local Supabase stack:

```bash
npx supabase start
npx supabase migration up
```

> `migration up` targets the local stack. `db push` is for a linked remote project — they are
> not interchangeable.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run compile` | Development build |
| `npm run watch` | Rebuild on change |
| `npm run package` | Production build |
| `npm run check-types` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Architecture

The extension is a single WebView panel (`src/webview/`) talking to the extension host over a
typed message protocol (`src/webview/protocol.ts`), which in turn calls Supabase through the
service layer (`src/auth/`, `src/md/`, `src/label/`, `src/load/`).

The WebView is bundled separately with `platform: 'browser'` so that importing `vscode` from it
fails at build time rather than at runtime.

## Things that are easy to get wrong

**The Supabase connection is baked in at build time.** `esbuild.js` inlines
`LOREHUB_SUPABASE_URL` and `LOREHUB_SUPABASE_ANON_KEY` into `dist/extension.js`; there is no way
to change them at runtime. Production builds read `.env.production.local` in preference to
`.env`, and the build fails if the URL still points at localhost.

**Row-level security does not replace table grants.** RLS narrows *which rows* a role can see;
it does not grant access to the table in the first place. The local Supabase stack grants
everything to `authenticated` by default, so a missing `GRANT` only shows up in production as
`permission denied for table ...`. When you add a table, write its policies **and** its grants
in the same migration.

**The extension id is not the same in both environments.** Under F5 it is
`YGears.lorehub-vscode` (as declared in `package.json`); installed from a VSIX it is normalized
to `ygears.lorehub-vscode`. The OAuth redirect URI is derived from it, so both spellings have to
be in Supabase's redirect allow list.

**`alert()` and `confirm()` do nothing in the WebView.** It is a sandboxed iframe, and they are
ignored without raising. Render messages into the DOM, or go through the extension host for
native dialogs.
