# POE Trade Master

Local automation for Path of Exile trade searches that refreshes a trade URL and clicks the first available `Travel to Hideout` action.

## What This Repo Contains

- A Codex skill at `skills/poe-trade-hideout`
- A Playwright-based helper script for POE trade pages
- Setup for reusing a dedicated signed-in Chrome session locally

## Prerequisites

- Windows
- Google Chrome installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Node.js LTS installed
- Codex installed locally
- A Path of Exile account you can sign into manually

## Repo Layout

- `skills/poe-trade-hideout/SKILL.md`
- `skills/poe-trade-hideout/scripts/click-hideout.mjs`
- `skills/poe-trade-hideout/references/poe-trade-selectors.md`
- `skills/poe-trade-hideout/package.json`

## Local Setup

1. Install the skill dependencies:

```powershell
cd C:\Users\jeffb\Documents\code\poe-trade-master\skills\poe-trade-hideout
npm install
npx playwright install chromium
```

2. Copy the skill into your active Codex skills folder:

```powershell
Copy-Item `
  'C:\Users\jeffb\Documents\code\poe-trade-master\skills\poe-trade-hideout' `
  'C:\Users\jeffb\.codex\skills\poe-trade-hideout' `
  -Recurse -Force
```

3. Add Playwright MCP to `C:\Users\jeffb\.codex\config.toml`:

```toml
[mcp_servers.playwright]
command = "C:\\Program Files\\nodejs\\npx.cmd"
args = ["-y", "@playwright/mcp@latest"]
```

4. Restart Codex so it picks up the new skill and MCP server config.

## Dedicated Chrome Session Setup

This project works best when it reuses a dedicated Chrome profile that you sign into manually once.

1. Create or reuse this profile folder:

```text
C:\Users\jeffb\Documents\code\poe-trade-master\.chrome-poe-profile
```

2. Launch Chrome with that profile and remote debugging enabled:

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  '--user-data-dir=C:\Users\jeffb\Documents\code\poe-trade-master\.chrome-poe-profile' `
  '--remote-debugging-port=9222' `
  '--new-window' `
  'https://www.pathofexile.com/trade/search/Mirage/mkjjoygzs6'
```

3. Sign into Path of Exile in that Chrome window and complete any CAPTCHA there.

4. Leave that Chrome window open while automation attaches to it.

## Running the Helper Directly

### Headless check

Useful for validating URL handling or no-login flows:

```powershell
cd C:\Users\jeffb\Documents\code\poe-trade-master\skills\poe-trade-hideout
node .\scripts\click-hideout.mjs 'https://www.pathofexile.com/trade/search/Mirage/mkjjoygzs6' --headless
```

### Attach to the signed-in Chrome session

This is the recommended local workflow:

```powershell
cd C:\Users\jeffb\Documents\code\poe-trade-master\skills\poe-trade-hideout
node .\scripts\click-hideout.mjs `
  'https://www.pathofexile.com/trade/search/Mirage/mkjjoygzs6' `
  --attach-to-chrome `
  --user-data-dir 'C:\Users\jeffb\Documents\code\poe-trade-master\.chrome-poe-profile' `
  --cdp-port 9222 `
  --timeout-ms 120000
```

### Watch a trade for up to an hour

This polls roughly once per minute with a small random offset and stops early if `Travel to Hideout` is clicked:

```powershell
cd C:\Users\jeffb\Documents\code\poe-trade-master\skills\poe-trade-hideout
node .\scripts\click-hideout.mjs `
  'https://www.pathofexile.com/trade/search/Mirage/mkjjoygzs6' `
  --attach-to-chrome `
  --user-data-dir 'C:\Users\jeffb\Documents\code\poe-trade-master\.chrome-poe-profile' `
  --cdp-port 9222 `
  --duration-ms 3600000 `
  --interval-ms 60000 `
  --jitter-ms 4000 `
  --timeout-ms 120000
```

## Codex Skill Usage

After the skill is installed and Codex has been restarted, invoke it with a prompt like:

```text
Use $poe-trade-hideout on this Path of Exile trade URL and click Travel to Hideout if a live result is available.
```

## Current Behavior Notes

- If POE requires login and the helper is running headless, it reports that login is required.
- In an attached Chrome session, the helper reuses the signed-in browser state.
- Some POE searches render totals first and only materialize listing rows after `Load More`; the helper handles that.
- If a normal click fails because the button is outside the visible row viewport, the helper falls back to a direct DOM click.
- In watch mode, the helper keeps retrying until it clicks a hideout action or the configured duration expires.

## Troubleshooting

### Chrome debug endpoint is not reachable

Reopen Chrome with `--remote-debugging-port=9222` and leave that window running.

### Login or CAPTCHA blocks the flow

Solve login and CAPTCHA manually in the dedicated Chrome profile before rerunning the helper.

### Codex does not see the skill

- Confirm the skill exists at `C:\Users\jeffb\.codex\skills\poe-trade-hideout`
- Confirm `C:\Users\jeffb\.codex\config.toml` includes the Playwright MCP block
- Restart Codex

### The helper cannot find `Travel to Hideout`

- Make sure the trade page is signed in
- Make sure the page has actual actionable listings
- Keep the dedicated Chrome session open and attached
