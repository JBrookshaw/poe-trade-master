---
name: poe-trade-hideout
description: Refresh a Path of Exile trade search URL, detect whether a live listing is available, and click the first visible Travel to Hideout button. Use this skill when a user provides a POE trade URL and wants browser automation to refresh the search and travel only if an actionable result exists.
---

# POE Trade Hideout

## Overview

Use this skill for Path of Exile trade search pages where the goal is simple:
refresh the given search URL, check whether an actionable result exists, and click
`Travel to Hideout` for the first visible listing.

Prefer the bundled Playwright script for deterministic execution. If the page shape
changes or the script cannot find the control cleanly, use Playwright MCP to inspect
the page and complete the same workflow interactively.

## Inputs

- A full Path of Exile trade search URL.
- Optional execution preference such as headed or headless mode.
- Optional browser override such as `--browser-channel chrome`.
- Optional attach mode such as `--attach-to-chrome --cdp-port 9222` for a normal signed-in Chrome session started with remote debugging enabled.
- Optional watch mode controls such as `--duration-ms 3600000 --interval-ms 60000 --jitter-ms 4000`.

Reject or clarify if the input is not a trade search URL.

## Workflow

1. Run the bundled helper:
   `node ./scripts/click-hideout.mjs "<trade-url>"`
   Headed runs default to your installed Chrome channel.
   If reusing a manually signed-in dedicated Chrome session, use attach mode instead of launching a fresh browser.
   For sustained monitoring, run it for an hour with a one-minute polling interval and a few seconds of jitter.
2. Let the helper load the page, refresh it once, and wait for actionable content.
3. If the page requires a Path of Exile sign-in and the browser is headed, wait for the user to complete sign-in, then resume the trade flow.
4. If the helper reports `actionTaken: true`, return success and stop.
5. If the helper reports no actionable result, return that status without clicking anything else.
6. If the helper fails because the page structure changed, open the same URL with Playwright MCP and:
   - refresh the page once,
   - look for the first visible control named `Travel to Hideout`,
   - click it only if it is visible and enabled,
   - stop after the first valid click.

## Guardrails

- Do not click whisper, invite, or unrelated action buttons.
- Do not click anything if there are no results or no visible `Travel to Hideout` action.
- If the trade page requires a Path of Exile sign-in, keep the browser open and wait for the user to sign in when running headed.
- If running headless and the trade page requires sign-in, report that login is required.
- Prefer text and role based targeting over brittle CSS selectors.
- On failure, preserve the helper script's screenshot and report the reason.

## Resources

- Selector notes: `references/poe-trade-selectors.md`
- Helper script: `scripts/click-hideout.mjs`
