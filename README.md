# 💣 MinePass

A Firefox browser extension that works as a password manager — with a twist: you must **win a round of Minesweeper** to unlock your credentials on any site.

## Features

- **AES-256-GCM encryption** — vault is encrypted with a master password using PBKDF2 key derivation (150,000 iterations)
- **Minesweeper challenge** — beginner mode (9×9 grid, 10 mines) must be won to autofill credentials
- **Auto-detects login forms** — injects a 💣 MinePass button next to password fields on any site
- **Smart autofill** — fills both username and password fields, dispatches native input events for compatibility with React/Vue/etc.
- **Session management** — vault stays unlocked for your browser session, locks on close
- **Full vault manager** — add, edit, and delete credentials via the popup UI

## Installation (Firefox)

### Development Mode
1. Clone or download this repo
2. Open Firefox and navigate to `about:debugging`
3. Click **"This Firefox"** → **"Load Temporary Add-on..."**
4. Select the `manifest.json` file from this folder

### Production (AMO)
Once approved on Mozilla Add-ons, users can install directly from:  
https://addons.mozilla.org/en-US/firefox/addon/minepass/

> For permanent installation without the browser session restriction, use Firefox Developer Edition and set `xpinstall.signatures.required` to `false` in `about:config`.

## Usage

### First time setup
1. Click the 💣 icon in your Firefox toolbar
2. Create a master password (minimum 8 characters)
3. Add credentials with **+ Add** — the current tab's URL is pre-filled

### Autofilling a password
1. Navigate to any login page
2. Click the **💣 MinePass** button that appears next to the password field
3. Win Minesweeper (left-click to reveal, right-click to flag)
4. Credentials are autofilled automatically on win

### Controls
| Input | Action |
|---|---|
| Left click | Reveal cell |
| Right click | Place / remove flag |
| 😐 button | New game |

## Development

### Prerequisites
- Node.js (for web-ext)
- Firefox Developer Edition (recommended)

### Setup
```bash
npm install
```

### Build Commands
```bash
# Lint the extension
npm run lint

# Build unsigned extension
npm run build

# Sign for AMO submission (requires API credentials)
npm run sign
```

### AMO Submission
1. Create a Mozilla developer account at https://addons.mozilla.org/en-US/developers/
2. Get your API credentials from the developer dashboard
3. Set environment variables: `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`
4. Run `npm run sign` to build and submit
5. Check submission status at https://addons.mozilla.org/en-US/developers/

## Security Notes

- The master password never leaves your device
- Decrypted credentials only exist in memory during autofill and are never written to disk
- Session key is stored in `browser.storage.session` (cleared when the browser closes)
- Encrypted vault is stored in `browser.storage.local`

## File Structure

```
minesweeper-passwords/
├── manifest.json   # Extension manifest (MV3)
├── background.js   # Crypto engine, vault I/O, session management
├── content.js      # Form detection, Minesweeper game, autofill
├── content.css     # Overlay and board styles
├── popup.html      # Vault manager UI
├── popup.js        # Vault manager logic
└── popup.css       # Vault manager styles
```
