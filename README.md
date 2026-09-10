LoreHub
---
*[日本語](README.ja.md)*

### Manage your ever-growing pile of AI md files in one place

Sign in with GitHub on a new machine and your library is already there, so you never have to collect the files again.

> **Early release** — LoreHub is still young, so features and behavior may change.

![The LoreHub md library panel](https://raw.githubusercontent.com/ygears-lab/lorehub-vscode/main/assets/screenshots/01-library-overview.png)

### Main features
- Create a new md file
- Import an existing file
- Create labels
- Attach labels to md files
- Load (download) an md file into your project
  - If a file with the same name already exists, the diff is shown before it is overwritten
- Cloud storage, so you can manage the same library from several machines

![The md list filtered by the "frontend" label](https://raw.githubusercontent.com/ygears-lab/lorehub-vscode/main/assets/screenshots/02-label-filter.png)


### Requirements
VS Code `1.104.0` or later

### Basic usage
1. Install the extension
2. Run **LoreHub: Open My Library** from the Command Palette (Ctrl/Cmd + Shift + P)
3. Sign in with GitHub
4. Create an md file (or import one)
5. Add labels if you need them
6. Load the md file into your project

*If a file with the same name exists, you can check the diff before overwriting it.*
![The diff editor shown when loading a file that already exists](https://raw.githubusercontent.com/ygears-lab/lorehub-vscode/main/assets/screenshots/03-load-diff.png)

### Keyboard

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl/Cmd</kbd> + <kbd>S</kbd> | Save the md file you are editing |
| <kbd>/</kbd> | Focus the search box |
| <kbd>↑</kbd> <kbd>↓</kbd> | Move through the list |
| <kbd>Esc</kbd> | Close the popover, then clear the search |

### Commands

Type `lorehub` in the Command Palette (Ctrl/Cmd + Shift + P) to see the list.

| Command | Command ID | Description |
| --- | --- | --- |
| LoreHub:<br>Open My Library | `lorehub.openMdPanel` | Opens the panel where you browse, edit and label your md files |
| LoreHub:<br>Load md into Project | `lorehub.loadToProject` | Picks an md file from your library and writes it into your project |
| LoreHub:<br>Login with GitHub | `lorehub.login` | Signs you in with your GitHub account |
| LoreHub:<br>Logout | `lorehub.logout` | Signs you out |

Note: **Login with GitHub** appears in the Command Palette only when you are signed out, and **Logout** only when you are signed in.


#### You can also run them from outside the Command Palette.

- **Button in the editor title bar**: when a `CLAUDE.md` / `AGENTS.md` / `SKILL.md` / `.cursorrules` file is open, the book icon at the top right runs **Open My Library**.
- **Explorer context menu**: right-click a folder and **Load md into Project** appears, so you can load an md file into that folder.



### Settings

Go to Settings → Extensions → **LoreHub** to change them. You can also edit `settings.json` directly.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `lorehub.statusBar.enabled` | `boolean` | `false` | Shows whether you are signed in to LoreHub in the status bar |

### Privacy

See the [Privacy Policy](PRIVACY.md) for what data LoreHub handles.
