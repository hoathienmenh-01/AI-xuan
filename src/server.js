'use strict';

const path = require('path');
const express = require('express');

const config = require('./config');
const logger = require('./utils/logger');

// Initialize DB on boot.
require('./db');

const projectsRoute = require('./routes/projects');
const referencesRoute = require('./routes/references');
const promptsRoute = require('./routes/prompts');
const jobsRoute = require('./routes/jobs');
const outputsRoute = require('./routes/outputs');
const queueRoute = require('./routes/queue');
const systemRoute = require('./routes/system');
const recoveryRoute = require('./routes/recovery');

const worker = require('./queue/worker');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Static frontend.
app.use(express.static(config.paths.publicDir, { extensions: ['html'] }));

// API.
app.use('/api/projects', projectsRoute);
app.use('/api/references', referencesRoute);
app.use('/api/prompts', promptsRoute);
app.use('/api/jobs', jobsRoute);
app.use('/api/outputs', outputsRoute);
app.use('/api/queue', queueRoute);
app.use('/api/system', systemRoute);
app.use('/api/recovery', recoveryRoute);

// Fallback: serve the SPA shell for any unknown non-API GET.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(config.paths.publicDir, 'index.html'));
});

// 404 + error handlers.
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ error: 'not found', path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error('http error', { message: err.message, stack: err.stack });
  } else {
    logger.warn('http error', { message: err.message, status });
  }
  res.status(status).json({ error: err.message || 'internal error' });
});

const server = app.listen(config.port, config.host, () => {
  logger.info(`server listening on http://${config.host}:${config.port}`);
  if (process.env.SKIP_WORKER !== '1') {
    worker.start();
  } else {
    logger.warn('queue worker disabled via SKIP_WORKER=1');
  }
});

function shutdown(signal) {
  logger.info(`received ${signal}, shutting down`);
  worker.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
