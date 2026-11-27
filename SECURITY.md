# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.1.x | ✅ |
| < 1.1 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.
Use GitHub's private reporting instead: **Security › Report a vulnerability** on this repository.
You'll get a reply as soon as possible, and a fix and advisory will be published when it's ready.

## How Glasschat handles your data

- Glasschat loads the official `https://web.whatsapp.com` page. Messages are end-to-end encrypted by WhatsApp and never pass through any Glasschat server — there is none.
- Settings, notes, scheduled messages and the PIN hash are stored locally in `%APPDATA%\Glasschat`. The PIN is stored only as a salted SHA-256 hash.
- The window runs with `contextIsolation`, `sandbox` and no Node integration in the page. Navigation away from WhatsApp Web opens in your default browser.
- The app lock is a convenience privacy screen, not disk encryption: someone with access to your Windows account can still read local app data.
