'use strict';

// Persistent browser context for Google Flow.
//
// We deliberately use a *persistent* context with a real on-disk profile so the
// user can sign in to Google ONCE in the visible Chrome window and the cookies
// stay around between jobs. We never automate the login flow.

const fs = require('fs');
const { chromium } = require('playwright');

const config = require('../config');
const logger = require('../utils/logger');

let contextPromise = null;
let context = null;
let page = null;

async function ensureContext() {
  if (context) return context;
  if (contextPromise) return contextPromise;

  fs.mkdirSync(config.paths.browserProfile, { recursive: true });

  contextPromise = chromium.launchPersistentContext(config.paths.browserProfile, {
    headless: config.flow.headless,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  });

  context = await contextPromise;
  logger.info('automation: persistent context launched', {
    profile: config.paths.browserProfile,
    headless: config.flow.headless,
  });

  context.on('close', () => {
    logger.warn('automation: context closed externally');
    context = null;
    page = null;
    contextPromise = null;
  });

  return context;
}

async function ensurePage() {
  const ctx = await ensureContext();
  if (page && !page.isClosed()) return page;

  const pages = ctx.pages();
  page = pages.length ? pages[0] : await ctx.newPage();
  return page;
}

async function gotoFlow() {
  const p = await ensurePage();
  if (!p.url().startsWith('https://labs.google/fx/')) {
    await p.goto(config.flow.url, { waitUntil: 'domcontentloaded' });
  }
  return p;
}

async function getStatus() {
  if (!context) {
    return { launched: false, url: null, signedIn: null };
  }
  try {
    const p = await ensurePage();
    const url = p.url();
    return { launched: true, url, signedIn: null };
  } catch (err) {
    return { launched: true, url: null, signedIn: null, error: err.message };
  }
}

async function close() {
  if (context) {
    try {
      await context.close();
    } catch (_err) {
      // ignore
    }
  }
  context = null;
  page = null;
  contextPromise = null;
}

module.exports = {
  ensureContext,
  ensurePage,
  gotoFlow,
  getStatus,
  close,
};
