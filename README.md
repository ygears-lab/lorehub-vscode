# LoreHub

**Your personal, cloud-synced library of AI config files — inside VS Code.**

*[日本語版はこちら](README.ja.md)*

You have collected a lot of `CLAUDE.md`, `SKILL.md`, `.cursorrules` and `AGENTS.md` files.
They are scattered across repositories, gists, and folders on whichever machine you happened
to be using. When you start a new project, you cannot find the one you wanted.

LoreHub keeps them in one place, tied to your account rather than to one machine, and puts
them one click away from the project you are working on right now.

<!-- SCREENSHOT 1 — the differentiator. The same md library open on a second machine.
     Per docs/2026-09-06 requirements §10.1, cloud sync is the headline, not the loading. -->

## Why LoreHub

Most tools in this space are local-first: your library lives in one folder, on one computer.
LoreHub is built the other way around.

- **It follows your account, not your machine.** Sign in with GitHub on a new laptop and your
  whole library is there.
- **It stays in the editor.** No web app to switch to, no folder to remember.
- **It is organized for people who collect a lot.** Labels, counts, and search are designed for
  a library that keeps growing, not for five files.

## Features

**Write or import**
Create Markdown from scratch in the editor panel, or import a file that is already on disk.

**Organize with labels**
Assign as many labels as you like to a file. The sidebar shows every label with a live count,
so you can see at a glance which parts of your library are growing and which are empty.
Filter by one label or several at once.

<!-- SCREENSHOT 2 — the three-pane panel: label sidebar, md list, editor. -->

**Find things again**
Search by title or filename, on top of label filtering. Files are sorted by most recently
updated, so what you actually use stays at the top.

**Load into a project**
Write any file into your workspace, choosing where it goes each time. If a file with that name
already exists, LoreHub opens a diff so you can see exactly what would change before it
overwrites anything.

<!-- SCREENSHOT 3 — the diff shown before overwriting an existing file. -->

**Works offline**
Your library stays readable when the network is down. Editing is disabled until you are back
online, so nothing is silently lost.

## Getting started

1. Install the extension.
2. Run **LoreHub: Open My Library** from the Command Palette.
3. Sign in with GitHub.
4. Create a file or import one, give it a label, and load it into your project.

### Keyboard

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl/Cmd</kbd> + <kbd>N</kbd> | New file |
| <kbd>Ctrl/Cmd</kbd> + <kbd>S</kbd> | Save |
| <kbd>/</kbd> | Focus search |
| <kbd>↑</kbd> <kbd>↓</kbd> | Move through the list |
| <kbd>Esc</kbd> | Clear search / close popover |

These commands are also available from the Command Palette:
**Open My Library**, **Load md into Project**, **Login with GitHub**, **Logout**.

## Requirements

VS Code `1.104.0` or later.

## Pricing

**Everything in LoreHub is free today.** There are no paid features, no trial, and no account
tiers in this release.

In the future some additional capabilities — team sharing, or higher limits on translation and
summarization — may become paid. Everything described on this page is intended to stay free.

If there is something you would pay for, [tell us in an issue](https://github.com/ygears-lab/lorehub-vscode/issues).
That is the most useful thing you can send us right now.

## Your data

The Markdown you save is stored in LoreHub's Supabase backend and is tied to your GitHub
account. Every row is protected by PostgreSQL row-level security, so no other user can read it.
Your authentication token is kept in VS Code's SecretStorage, never in plain text.

Files you load into a project are written to your machine only. LoreHub never reads the rest of
your workspace.

<!-- TODO: link the published privacy policy here before the Marketplace listing goes live. -->

## Contributing

Bug reports and feature requests are welcome in
[Issues](https://github.com/ygears-lab/lorehub-vscode/issues).
For building and running the extension locally, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Bundled dependencies are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
