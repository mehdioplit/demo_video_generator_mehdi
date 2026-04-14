/**
 * Website Capture Module
 * Uses Playwright to screenshot a website at different scroll positions and pages,
 * and extracts text content for script generation.
 */

import { chromium, type Browser, type Page } from "playwright";
import path from "path";
import fs from "fs";
import type { Scene } from "../types";

export interface CaptureResult {
  /** Extracted text content from the website */
  textContent: string;
  /** List of page URLs discovered on the site */
  discoveredPages: string[];
  /** Screenshots taken (path + metadata) */
  screenshots: { path: string; url: string; scrollPercent: number }[];
}

/**
 * Captures screenshots and extracts content from a website.
 */
export async function captureWebsite(
  url: string,
  workDir: string,
  options: { width: number; height: number } = { width: 1920, height: 1080 }
): Promise<CaptureResult> {
  const screenshotDir = path.join(workDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    console.log(`📸 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Extract text content
    const textContent = await extractTextContent(page);

    // Discover internal links
    const discoveredPages = await discoverPages(page, url);

    // Take screenshots at different scroll positions on the main page
    const screenshots = await captureScrollPositions(
      page,
      url,
      screenshotDir,
      "main"
    );

    // Capture up to 4 additional pages
    const pagesToCapture = discoveredPages.slice(0, 4);
    for (let i = 0; i < pagesToCapture.length; i++) {
      try {
        await page.goto(pagesToCapture[i], {
          waitUntil: "networkidle",
          timeout: 15000,
        });
        const pageShots = await captureScrollPositions(
          page,
          pagesToCapture[i],
          screenshotDir,
          `page${i}`
        );
        screenshots.push(...pageShots);
      } catch (err) {
        console.warn(`⚠️  Could not capture ${pagesToCapture[i]}: ${err}`);
      }
    }

    console.log(
      `✅ Captured ${screenshots.length} screenshots from ${url}`
    );

    return { textContent, discoveredPages, screenshots };
  } finally {
    await browser.close();
  }
}

/**
 * Takes a screenshot for a specific scene (after the script is generated).
 */
export async function captureSceneScreenshot(
  scene: Scene,
  workDir: string,
  options: { width: number; height: number } = { width: 1920, height: 1080 }
): Promise<string> {
  const screenshotDir = path.join(workDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const outputPath = path.join(screenshotDir, `scene_${scene.index}.png`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await page.goto(scene.pageUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Scroll to the specified position
    if (scene.scrollPercent > 0) {
      await autoScroll(page, scene.scrollPercent);
    }

    // Click element if specified
    if (scene.action === "click" && scene.selector) {
      try {
        await page.click(scene.selector, { timeout: 3000 });
        await page.waitForTimeout(500); // Wait for any animation
      } catch {
        console.warn(`⚠️  Could not click selector: ${scene.selector}`);
      }
    }

    await page.screenshot({ path: outputPath, type: "png" });
    return outputPath;
  } finally {
    await browser.close();
  }
}

/**
 * Batch-capture all scene screenshots, reusing a single browser instance.
 */
export async function captureAllScenes(
  scenes: Scene[],
  workDir: string,
  options: { width: number; height: number } = { width: 1920, height: 1080 }
): Promise<Scene[]> {
  const screenshotDir = path.join(workDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    let currentUrl = "";

    for (const scene of scenes) {
      const outputPath = path.join(screenshotDir, `scene_${scene.index}.png`);

      // Only navigate if the URL changed
      if (scene.pageUrl !== currentUrl) {
        console.log(`📸 Navigating to ${scene.pageUrl}...`);
        await page.goto(scene.pageUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        currentUrl = scene.pageUrl;
      }

      // Scroll to position
      if (scene.scrollPercent > 0) {
        await autoScroll(page, scene.scrollPercent);
      } else {
        await page.evaluate(() => window.scrollTo(0, 0));
      }

      // Perform click action if needed
      if (scene.action === "click" && scene.selector) {
        try {
          await page.click(scene.selector, { timeout: 3000 });
          await page.waitForTimeout(500);
        } catch {
          console.warn(`⚠️  Could not click: ${scene.selector}`);
        }
      }

      await page.waitForTimeout(300); // Brief settle time
      await page.screenshot({ path: outputPath, type: "png" });
      scene.screenshotPath = outputPath;
      console.log(`  ✅ Scene ${scene.index}: ${outputPath}`);
    }

    return scenes;
  } finally {
    await browser.close();
  }
}

// --- Helpers ---

async function extractTextContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Remove scripts, styles, and hidden elements
    const clone = document.cloneNode(true) as Document;
    clone
      .querySelectorAll("script, style, noscript, [aria-hidden='true']")
      .forEach((el) => el.remove());

    // Get visible text
    const text = clone.body?.innerText || clone.body?.textContent || "";
    // Clean up excessive whitespace
    return text.replace(/\n{3,}/g, "\n\n").trim();
  });
}

async function discoverPages(page: Page, baseUrl: string): Promise<string[]> {
  const base = new URL(baseUrl);
  const links = await page.evaluate((origin: string) => {
    return Array.from(document.querySelectorAll("a[href]"))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter(
        (href) =>
          href.startsWith(origin) &&
          !href.includes("#") &&
          !href.match(/\.(pdf|zip|png|jpg|gif|svg)$/i)
      );
  }, base.origin);

  // Deduplicate and remove the base URL itself
  const unique = [...new Set(links)].filter((l) => l !== baseUrl && l !== baseUrl + "/");
  return unique.slice(0, 10);
}

async function captureScrollPositions(
  page: Page,
  url: string,
  outputDir: string,
  prefix: string
): Promise<{ path: string; url: string; scrollPercent: number }[]> {
  const results: { path: string; url: string; scrollPercent: number }[] = [];

  // Get page height
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  // Calculate scroll positions: top, 25%, 50%, 75%, bottom
  const scrollPositions =
    pageHeight <= viewportHeight
      ? [0]
      : [0, 0.25, 0.5, 0.75, 1.0];

  for (let i = 0; i < scrollPositions.length; i++) {
    const scrollPercent = scrollPositions[i];
    await autoScroll(page, scrollPercent);
    await page.waitForTimeout(200);

    const filePath = path.join(outputDir, `${prefix}_scroll${i}.png`);
    await page.screenshot({ path: filePath, type: "png" });
    results.push({ path: filePath, url, scrollPercent });
  }

  return results;
}

async function autoScroll(page: Page, percent: number): Promise<void> {
  await page.evaluate(async (pct: number) => {
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    const target = maxScroll * pct;
    window.scrollTo({ top: target, behavior: "smooth" });
    // Wait for smooth scroll to finish
    await new Promise((r) => setTimeout(r, 400));
  }, percent);
}
