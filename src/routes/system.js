'use strict';

const express = require('express');

const browser = require('../automation/browser');
const flow = require('../automation/flow');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'flow-image-production-tool' });
});

router.get('/browser/status', async (_req, res, next) => {
  try {
    res.json(await browser.getStatus());
  } catch (err) {
    next(err);
  }
});

router.post('/browser/launch', async (_req, res, next) => {
  try {
    await browser.ensureContext();
    const page = await browser.ensurePage();
    await page.goto('https://labs.google/fx/vi/tools/flow', {
      waitUntil: 'domcontentloaded',
    }).catch(() => {});
    res.json(await browser.getStatus());
  } catch (err) {
    next(err);
  }
});

router.post('/browser/close', async (_req, res, next) => {
  try {
    await browser.close();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Verify that we are signed in and on the Flow page. Useful before queuing
// a batch of jobs.
router.post('/browser/verify-flow', async (_req, res, next) => {
  try {
    await flow.ensureFlowAndSignedIn();
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ ok: false, error: err.message });
  }
});

module.exports = router;
