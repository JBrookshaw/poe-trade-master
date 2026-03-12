# POE Trade Selector Notes

## Primary Target

- Prefer a visible control with accessible name matching `Travel to Hideout`.
- Search buttons first, then other clickable controls if the page renders a custom button element.

## Fallback Signals

- A successful actionable result usually exposes at least one `Travel to Hideout` control.
- Treat explicit empty-state text such as `No results found` as a no-result outcome.
- Treat the POE sign-in gate as a wait state in headed runs and a hard stop in headless runs.
- If the page loads but no hideout control appears, report `no actionable result` instead of guessing.

## Failure Capture

- Save a screenshot on navigation or selector failure.
- Include the page title and final URL in script output when available.
- Prefer the installed Chrome channel for headed login flows because it is less likely to look like a fresh automation-only browser session.
- If you want to reuse a manual signed-in session, launch Chrome with remote debugging and attach over CDP instead of relaunching the same profile under Playwright.
