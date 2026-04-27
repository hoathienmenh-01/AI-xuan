'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const config = {
  port: Number(process.env.PORT) || 3030,
  host: process.env.HOST || '127.0.0.1',

  paths: {
    root: ROOT,
    data: path.join(ROOT, 'data'),
    db: path.join(ROOT, 'data', 'flow.db'),
    outputs: path.join(ROOT, 'data', 'outputs'),
    references: path.join(ROOT, 'data', 'references'),
    screenshots: path.join(ROOT, 'data', 'screenshots'),
    browserProfile: path.join(ROOT, 'data', 'browser-profile'),
    logs: path.join(ROOT, 'logs'),
    publicDir: path.join(ROOT, 'public'),
  },

  flow: {
    url: 'https://labs.google/fx/vi/tools/flow',
    // How long to wait for a generate job to finish before marking manual_review.
    generateTimeoutMs: Number(process.env.FLOW_GENERATE_TIMEOUT_MS) || 5 * 60 * 1000,
    // Polling interval when checking for new images during a generate.
    pollIntervalMs: 1500,
    // Headless is OFF by default because the user must sign in manually.
    headless: false,
  },

  queue: {
    // Run one job at a time. Flow rate-limits quickly and the user only has one
    // browser window; do NOT raise this without a lot of care.
    concurrency: 1,
    // Poll interval for the worker loop.
    tickMs: 1000,
  },
};

module.exports = config;
