# Changelog

All notable changes to Glasschat are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-11-27

First public release.

### Fixed
- **Sending files as documents works with the 2026 WhatsApp Web layout.** WhatsApp's attach menu now creates its file picker on demand; Glasschat hands files directly to WhatsApp's own Document picker.
- **Glass background.** Removed the opaque layer WhatsApp places behind both panes, so the Acrylic/Mica backdrop shows through.
- **Bubble, header and composer styling** rebuilt on WhatsApp's current `data-testid` hooks and WDS color variables.

### Added
- Bundled, offline variable fonts: Inter (default), Segoe UI, Plus Jakarta Sans, Figtree, Manrope and Outfit. The app UI follows the chosen font.
- **Send files** button and `Ctrl+Shift+D` (always original quality).
- Explorer **Send to › Glasschat** shortcut.
- **Snip & send** screenshots, and an "ask" chooser for pasted images.
- **App lock** with PIN (at start, after idle, on minimize, `Ctrl+L`).
- **Do not disturb** with daily quiet hours, optional mute, hidden notification text.
- **Scheduled messages** and **private notes per chat**.
- **Formatting bar** and `Ctrl+B / I / Shift+X / Shift+K`.
- Violet theme, file chips in the send chooser, pending-files bar when no chat is open.
- `--showcase` mode that renders the real UI over an invented demo chat for screenshots.

## [1.0.0] — 2026-11-26

Private preview (not published): glass shell around WhatsApp Web with Acrylic/Mica/Tabbed backdrop, 8 themes, wallpaper, bubble colors, drag-and-drop send-as-document, command palette, quick replies, privacy blur, focus/wide/compact modes, mini mode, tray + unread badge, global hotkey, auto-save downloads, user CSS/JS extensions.

[1.1.0]: https://github.com/MaxSpecterZero/glasschat/releases/tag/v1.1.0
