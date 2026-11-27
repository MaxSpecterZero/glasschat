# Contributing to Glasschat

Thanks for helping! Bug reports, theme ideas and pull requests are all welcome.

## Quick start

```bash
git clone https://github.com/MaxSpecterZero/glasschat.git
cd glasschat
npm install        # also bundles the fonts into src/fonts.css
npm start          # run the app
```

| Script | What it does |
|---|---|
| `npm start` | Run Glasschat from source |
| `npm run check` | Syntax-check the main, preload and build scripts |
| `npm run selftest` | Open WhatsApp Web on a temporary profile, render the UI, save `selftest-*.png`, quit |
| `npm run showcase` | Render the UI over an invented demo chat and save screenshots to `showcase-out/` |
| `npm run dist` | Build the Windows installer and portable exe into `dist/` |

## Project layout

```
src/main.js      Electron main process: window, tray, IPC, lock, Send-to, snips, downloads
src/preload.js   Overlay UI and features, runs in an isolated world on web.whatsapp.com
src/glass.css    Restyles WhatsApp Web (data-testid hooks + WDS color variables)
src/ui.css       Glasschat's own overlay UI
scripts/         Font bundler and icon generator
showcase/        Demo page with invented chats, used only for screenshots
docs/            GitHub Pages website
```

## When WhatsApp Web changes

WhatsApp ships UI changes often. Most breakages are selectors:

1. Run the app and open DevTools (`Ctrl+Shift+I`).
2. Prefer stable hooks: `data-testid`, `aria-label`, `role`, element ids (`#app`, `#side`, `#main`), and WDS CSS variables. Avoid generated class names.
3. Update `src/glass.css` or the helpers at the top of `src/preload.js` (`attachButton`, `menuItem`, `composeBox`, …).

## Pull requests

- Keep PRs focused; describe what changed and how you tested it.
- Run `npm run check` and try the feature against a real WhatsApp Web session.
- **Never include real chats, names, phone numbers or account data** in screenshots, test files or issues. Use `npm run showcase` for screenshots.

## Releasing (maintainers)

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, then push a tag:

```bash
git tag v1.2.0 && git push origin v1.2.0
```

The **Release** workflow builds the installer and portable exe on GitHub and attaches them to the release.

## Code style

Plain JavaScript (no build step), 2-space indentation, small functions, no `innerHTML` (WhatsApp enforces Trusted Types — build DOM with the `h()` helper).
