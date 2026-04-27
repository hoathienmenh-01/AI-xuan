'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

fs.mkdirSync(config.paths.logs, { recursive: true });

const appLogPath = path.join(config.paths.logs, 'app.log');
const errorLogPath = path.join(config.paths.logs, 'error.log');

function ts() {
  return new Date().toISOString();
}

function write(file, line) {
  try {
    fs.appendFileSync(file, line + '\n');
  } catch (_err) {
    // If we cannot write logs we still want the process to keep running.
  }
}

function format(level, msg, meta) {
  const base = `[${ts()}] ${level} ${msg}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch (_err) {
    return `${base} [unserializable meta]`;
  }
}

const logger = {
  info(msg, meta) {
    const line = format('INFO ', msg, meta);
    // eslint-disable-next-line no-console
    console.log(line);
    write(appLogPath, line);
  },
  warn(msg, meta) {
    const line = format('WARN ', msg, meta);
    // eslint-disable-next-line no-console
    console.warn(line);
    write(appLogPath, line);
  },
  error(msg, meta) {
    const line = format('ERROR', msg, meta);
    // eslint-disable-next-line no-console
    console.error(line);
    write(appLogPath, line);
    write(errorLogPath, line);
  },
  debug(msg, meta) {
    if (!process.env.DEBUG) return;
    const line = format('DEBUG', msg, meta);
    // eslint-disable-next-line no-console
    console.log(line);
    write(appLogPath, line);
  },
};

module.exports = logger;
