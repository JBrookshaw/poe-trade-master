#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, "output");
const defaultProfileDir = path.join(outputDir, "browser-profile");
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    url: "",
    headless: false,
    timeoutMs: 45000,
    loginWaitMs: 300000,
    userDataDir: defaultProfileDir,
    browserChannel: "chrome",
    cdpPort: 9222,
    attachToChrome: false,
    durationMs: 60 * 60 * 1000,
    intervalMs: 60 * 1000,
    jitterMs: 4000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--") && !args.url) {
      args.url = value;
      continue;
    }

    if (value === "--headless") {
      args.headless = true;
      continue;
    }

    if (value === "--timeout-ms") {
      const next = argv[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("--timeout-ms requires a numeric value");
      }
      args.timeoutMs = Number(next);
      index += 1;
      continue;
    }

    if (value === "--login-wait-ms") {
      const next = argv[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("--login-wait-ms requires a numeric value");
      }
      args.loginWaitMs = Number(next);
      index += 1;
      continue;
    }

    if (value === "--user-data-dir") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--user-data-dir requires a value");
      }
      args.userDataDir = next;
      index += 1;
      continue;
    }

    if (value === "--browser-channel") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--browser-channel requires a value");
      }
      args.browserChannel = next;
      index += 1;
      continue;
    }

    if (value === "--cdp-port") {
      const next = argv[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("--cdp-port requires a numeric value");
      }
      args.cdpPort = Number(next);
      index += 1;
      continue;
    }

    if (value === "--attach-to-chrome") {
      args.attachToChrome = true;
      continue;
    }

    if (value === "--duration-ms") {
      const next = argv[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("--duration-ms requires a numeric value");
      }
      args.durationMs = Number(next);
      index += 1;
      continue;
    }

    if (value === "--interval-ms") {
      const next = argv[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("--interval-ms requires a numeric value");
      }
      args.intervalMs = Number(next);
      index += 1;
      continue;
    }

    if (value === "--jitter-ms") {
      const next = argv[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("--jitter-ms requires a numeric value");
      }
      args.jitterMs = Number(next);
      index += 1;
      continue;
    }
  }

  if (!args.url) {
    throw new Error("A trade URL is required");
  }

  return args;
}

function isTradeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return (
      /pathofexile\.com$/i.test(parsed.hostname) &&
      /\/trade\/search\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function ensureOutputDir() {
  await fs.mkdir(outputDir, { recursive: true });
}

async function settlePage(page) {
  await page.waitForTimeout(1500);
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    // POE trade pages can keep background requests alive; best-effort only.
  }
}

async function clickVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible())) {
      continue;
    }
    if (!(await candidate.isEnabled().catch(() => true))) {
      continue;
    }
    await candidate.scrollIntoViewIfNeeded().catch(() => {});
    try {
      await candidate.click({ timeout: 5000 });
    } catch {
      await candidate.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "center" });
        element.click();
      });
    }
    return true;
  }
  return false;
}

async function pageRequiresLogin(page) {
  if (/\/login\b/i.test(page.url())) {
    return true;
  }

  const signInHeading = page.getByRole("heading", { name: /sign in/i }).first();
  if (await signInHeading.isVisible().catch(() => false)) {
    return true;
  }

  const signInText = page.getByText(/you must sign in to your path of exile account/i).first();
  return signInText.isVisible().catch(() => false);
}

async function waitForLogin(page, loginWaitMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < loginWaitMs) {
    if (!(await pageRequiresLogin(page))) {
      return true;
    }

    await page.waitForTimeout(2000);
  }

  return false;
}

async function ensureListingsLoaded(page) {
  const rowCount = await page.locator(".row").count().catch(() => 0);
  if (rowCount > 2) {
    return;
  }

  const loadMore = page.getByRole("button", { name: /load more/i }).first();
  if (await loadMore.isVisible().catch(() => false)) {
    await loadMore.evaluate((element) => element.click());
    await page.waitForTimeout(3000);
  }
}

function nextDelayMs(intervalMs, jitterMs) {
  if (intervalMs <= 0) {
    return 0;
  }
  if (jitterMs <= 0) {
    return intervalMs;
  }
  const offset = Math.floor(Math.random() * ((jitterMs * 2) + 1)) - jitterMs;
  return Math.max(0, intervalMs + offset);
}

async function httpGetJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForCdpEndpoint(port, timeoutMs) {
  const startedAt = Date.now();
  const endpointUrl = `http://127.0.0.1:${port}/json/version`;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await httpGetJson(endpointUrl, 2000);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Timed out waiting for Chrome remote debugging on port ${port}`);
}

function getChromeExecutablePath() {
  const candidates = [
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe")
      : "",
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);

  return candidates[0];
}

async function isChromeUsingPort(port) {
  try {
    const data = await httpGetJson(`http://127.0.0.1:${port}/json/version`, 1500);
    return Boolean(data.webSocketDebuggerUrl);
  } catch {
    return false;
  }
}

async function startDetachedChrome(args) {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) {
    throw new Error("Google Chrome is not installed in a standard location");
  }

  const command = [
    `"${chromePath}"`,
    `--user-data-dir="${args.userDataDir}"`,
    `--remote-debugging-port=${args.cdpPort}`,
    "--new-window",
    `"${args.url}"`,
  ].join(" ");

  if (process.platform === "win32") {
    await execFileAsync("cmd.exe", ["/c", "start", '""', command], {
      windowsHide: true,
    });
    return;
  }

  throw new Error("Detached Chrome launch is only implemented for Windows");
}

async function runTradeFlow(page, args, result) {
  await page.goto(args.url, {
    waitUntil: "domcontentloaded",
    timeout: args.timeoutMs,
  });
  await settlePage(page);

  result.finalUrl = page.url();
  result.pageTitle = await page.title().catch(() => "");

  if (await pageRequiresLogin(page)) {
    if (args.headless) {
      result.failureReason = "Path of Exile login is required before trade actions are available";
      return;
    }

    console.log("Path of Exile sign-in required. Please complete sign-in in the open browser window.");
    const loginCompleted = await waitForLogin(page, args.loginWaitMs);
    result.finalUrl = page.url();
    result.pageTitle = await page.title().catch(() => "");

    if (!loginCompleted) {
      result.failureReason = "Timed out waiting for Path of Exile sign-in to complete";
      return;
    }

    await settlePage(page);
  }

  await page.goto(args.url, {
    waitUntil: "domcontentloaded",
    timeout: args.timeoutMs,
  });
  await settlePage(page);

  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: args.timeoutMs,
  });
  result.refreshed = true;
  await settlePage(page);
  await ensureListingsLoaded(page);

  result.finalUrl = page.url();
  result.pageTitle = await page.title().catch(() => "");

  if (await pageRequiresLogin(page)) {
    result.failureReason = "Path of Exile login is still required after waiting";
    return;
  }

  const noResultsText = page.getByText(/no results found|no results/i).first();
  if (await noResultsText.isVisible().catch(() => false)) {
    result.failureReason = "No results found after refresh";
    return;
  }

  const primaryButtons = page.getByRole("button", {
    name: /travel to hideout/i,
  });
  const fallbackButtons = page
    .locator("button, [role='button'], a")
    .filter({ hasText: /travel to hideout/i });

  const primaryCount = await primaryButtons.count();
  const fallbackCount = await fallbackButtons.count();
  result.resultFound = primaryCount > 0 || fallbackCount > 0;

  let clicked = false;
  if (primaryCount > 0) {
    clicked = await clickVisible(primaryButtons);
  }
  if (!clicked && fallbackCount > 0) {
    clicked = await clickVisible(fallbackButtons);
  }

  if (clicked) {
    result.actionTaken = true;
    return;
  }

  result.failureReason = result.resultFound
    ? "Travel to Hideout was present but not clickable"
    : "No actionable Travel to Hideout button found after refresh";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isTradeUrl(args.url)) {
    throw new Error("The supplied URL is not a Path of Exile trade search URL");
  }

  const result = {
    inputUrl: args.url,
    finalUrl: "",
    pageTitle: "",
    refreshed: false,
    resultFound: false,
    actionTaken: false,
    failureReason: "",
    screenshotPath: "",
    attempts: 0,
    elapsedMs: 0,
  };

  await ensureOutputDir();

  await fs.mkdir(args.userDataDir, { recursive: true });

  let browser;
  let context;
  let page;

  try {
    if (args.attachToChrome) {
      const alreadyRunning = await isChromeUsingPort(args.cdpPort);
      if (!alreadyRunning) {
        await startDetachedChrome(args);
      }

      const versionData = await waitForCdpEndpoint(args.cdpPort, args.timeoutMs);
      browser = await chromium.connectOverCDP(versionData.webSocketDebuggerUrl);
      context = browser.contexts()[0];
      if (!context) {
        throw new Error("Chrome remote debugging did not expose a browser context");
      }
      page = context.pages().find((entry) => entry.url() !== "about:blank") ?? (await context.newPage());
    } else {
      const launchOptions = {
        headless: args.headless,
      };

      if (!args.headless && args.browserChannel) {
        launchOptions.channel = args.browserChannel;
      }

      context = await chromium.launchPersistentContext(args.userDataDir, launchOptions);
      page = context.pages()[0] ?? (await context.newPage());
    }

    page.on("dialog", async (dialog) => {
      await dialog.dismiss().catch(() => {});
    });

    const startedAt = Date.now();
    const deadline = startedAt + Math.max(0, args.durationMs);

    while (Date.now() <= deadline) {
      result.attempts += 1;
      result.refreshed = false;
      result.resultFound = false;
      result.failureReason = "";
      result.screenshotPath = "";

      console.log(
        `Attempt ${result.attempts}: checking trade results at ${new Date().toISOString()}`,
      );

      await runTradeFlow(page, args, result);
      result.elapsedMs = Date.now() - startedAt;

      if (result.actionTaken) {
        break;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      const delayMs = Math.min(nextDelayMs(args.intervalMs, args.jitterMs), remainingMs);
      console.log(
        `Attempt ${result.attempts}: no action taken, waiting ${delayMs}ms before retry`,
      );
      await page.waitForTimeout(delayMs);
    }

    if (!result.actionTaken && !result.failureReason) {
      result.failureReason = "Timed out waiting for a clickable Travel to Hideout result";
    }

    result.elapsedMs = Date.now() - startedAt;

    if (!result.actionTaken && result.failureReason) {
      const screenshotPath = path.join(outputDir, "last-failure.png");
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      result.screenshotPath = screenshotPath;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const screenshotPath = path.join(outputDir, "last-failure.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    result.finalUrl = page.url();
    result.pageTitle = await page.title().catch(() => "");
    result.failureReason = error instanceof Error ? error.message : String(error);
    result.screenshotPath = screenshotPath;
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    if (!args.attachToChrome) {
      await page?.close().catch(() => {});
      await context?.close().catch(() => {});
    } else {
      await browser?.close().catch(() => {});
    }
  }
}

main().catch((error) => {
  const payload = {
    inputUrl: "",
    finalUrl: "",
    pageTitle: "",
    refreshed: false,
    resultFound: false,
    actionTaken: false,
    failureReason: error instanceof Error ? error.message : String(error),
    screenshotPath: "",
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(1);
});
