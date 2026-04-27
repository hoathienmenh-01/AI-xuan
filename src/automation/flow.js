'use strict';

// Google Flow automation primitives.
//
// IMPORTANT: This module deliberately does NOT bypass authentication, captchas,
// or quota. It only performs the same UI actions a logged-in human would: type
// into the prompt textarea, attach reference images, click the generate button,
// wait for the result image to appear, then download the bytes.
//
// Because the Flow UI changes over time, every selector lookup is tolerant: it
// tries a list of candidates and falls back to a heuristic (e.g. the first
// visible <textarea>). When we cannot find what we expect we capture a
// screenshot and throw a descriptive error so the caller can flag the job for
// manual recovery.

const fs = require('fs');
const path = require('path');

const config = require('../config');
const logger = require('../utils/logger');
const browser = require('./browser');

const PROMPT_SELECTORS = [
  'textarea[aria-label*="prompt" i]',
  'textarea[placeholder*="prompt" i]',
  'textarea[placeholder*="mô tả" i]',
  'textarea[placeholder*="describe" i]',
  'div[contenteditable="true"][role="textbox"]',
  'textarea',
];

const GENERATE_BUTTON_SELECTORS = [
  'button[aria-label*="generate" i]',
  'button[aria-label*="tạo" i]',
  'button:has-text("Generate")',
  'button:has-text("Tạo")',
  'button[type="submit"]',
];

const REFERENCE_INPUT_SELECTORS = [
  'input[type="file"][accept*="image"]',
  'input[type="file"]',
];

async function takeScreenshot(jobId, suffix = 'error') {
  try {
    const page = await browser.ensurePage();
    const dir = path.join(config.paths.screenshots, jobId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${suffix}-${Date.now()}.png`;
    const fullPath = path.join(dir, filename);
    await page.screenshot({ path: fullPath, fullPage: true });
    return path.relative(config.paths.data, fullPath);
  } catch (err) {
    logger.warn('automation: screenshot failed', { error: err.message });
    return null;
  }
}

async function findFirstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if (await loc.isVisible({ timeout: 250 })) {
        return loc;
      }
    } catch (_err) {
      // try next selector
    }
  }
  return null;
}

async function isOnFlowPage(page) {
  const url = page.url();
  return url.includes('labs.google/fx/') && url.includes('flow');
}

async function ensureFlowAndSignedIn() {
  const page = await browser.gotoFlow();
  if (!(await isOnFlowPage(page))) {
    throw new Error(
      `not on Flow page (current url: ${page.url()}). Please sign in manually and load Flow.`
    );
  }
  // Heuristic sign-in check: if the prompt textarea is visible we are in the app.
  const prompt = await findFirstVisible(page, PROMPT_SELECTORS);
  if (!prompt) {
    throw new Error(
      'Flow prompt input not found. You probably need to sign in or accept a Flow consent screen first.'
    );
  }
  return page;
}

async function typePrompt(page, text) {
  const target = await findFirstVisible(page, PROMPT_SELECTORS);
  if (!target) throw new Error('prompt input not found');
  await target.click();
  // Clear any existing text.
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Delete').catch(() => {});
  await target.fill('').catch(async () => {
    // contenteditable fallback
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Delete').catch(() => {});
  });
  await target.type(text, { delay: 8 });
}

async function attachReferences(page, filePaths) {
  if (!filePaths || !filePaths.length) return;
  const inputs = page.locator(REFERENCE_INPUT_SELECTORS.join(', '));
  const count = await inputs.count();
  if (!count) {
    throw new Error('no reference upload input found on page');
  }
  // Use the first file input. setInputFiles works even on hidden inputs.
  await inputs.first().setInputFiles(filePaths);
}

async function clickGenerate(page) {
  const btn = await findFirstVisible(page, GENERATE_BUTTON_SELECTORS);
  if (!btn) throw new Error('generate button not found');
  await btn.click();
}

async function snapshotImageUrls(page) {
  return page.evaluate(() => {
    const urls = new Set();
    document.querySelectorAll('img').forEach((img) => {
      const src = img.currentSrc || img.src || '';
      if (!src) return;
      if (src.startsWith('data:')) return;
      // Only look at the obvious "result" candidates: large images the page
      // renders in the main content area. We approximate "large" via natural
      // size and bounding box.
      const r = img.getBoundingClientRect();
      if (r.width >= 256 && r.height >= 256) {
        urls.add(src);
      }
    });
    return Array.from(urls);
  });
}

async function waitForNewImage(page, baseline, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = baseline;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for new image');
    }
    await page.waitForTimeout(config.flow.pollIntervalMs);
    const current = await snapshotImageUrls(page);
    const fresh = current.filter((u) => !baseline.includes(u));
    if (fresh.length > 0) {
      return fresh;
    }
    last = current;
    void last;
  }
}

async function downloadImage(page, url) {
  // Use the page's session so cookies/CORS are respected, then read the bytes
  // via the Buffer API on the Node side.
  const response = await page.request.get(url);
  if (!response.ok()) {
    throw new Error(`failed to download image (${response.status()})`);
  }
  const buf = await response.body();
  const ct = response.headers()['content-type'] || 'image/png';
  let ext = '.png';
  if (ct.includes('jpeg')) ext = '.jpg';
  else if (ct.includes('webp')) ext = '.webp';
  else if (ct.includes('gif')) ext = '.gif';
  return { buffer: buf, contentType: ct, ext };
}

/**
 * Run a single Flow image-generation job.
 *
 * @param {object} args
 * @param {string} args.jobId
 * @param {string} args.prompt              The final text to type into Flow.
 * @param {string[]} args.referencePaths    Absolute paths to reference image files.
 * @param {function} args.onEvent           (level, message, meta?) => void
 * @returns {Promise<{ images: Array<{ buffer: Buffer, ext: string }> }>}
 */
async function runGenerateJob({ jobId, prompt, referencePaths, onEvent }) {
  const evt = (level, message, meta) => {
    try {
      if (onEvent) onEvent(level, message, meta);
    } catch (_err) {
      // ignore listener errors
    }
  };

  evt('info', 'opening Flow page');
  const page = await ensureFlowAndSignedIn();

  evt('info', 'snapshotting baseline images');
  const baseline = await snapshotImageUrls(page);

  if (referencePaths && referencePaths.length) {
    evt('info', 'attaching references', { count: referencePaths.length });
    await attachReferences(page, referencePaths);
  }

  evt('info', 'typing prompt', { length: prompt.length });
  await typePrompt(page, prompt);

  evt('info', 'clicking generate');
  await clickGenerate(page);

  evt('info', 'waiting for new image');
  const fresh = await waitForNewImage(page, baseline, config.flow.generateTimeoutMs);
  evt('info', 'new images detected', { count: fresh.length });

  const images = [];
  for (const url of fresh) {
    try {
      const dl = await downloadImage(page, url);
      images.push(dl);
    } catch (err) {
      evt('warn', 'failed to download one image', { url, error: err.message });
    }
  }
  if (!images.length) {
    throw new Error('detected new images but none could be downloaded');
  }
  return { images };
}

module.exports = {
  runGenerateJob,
  takeScreenshot,
  ensureFlowAndSignedIn,
};
