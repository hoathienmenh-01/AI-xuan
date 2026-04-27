'use strict';

const fs = require('fs');
const path = require('path');

const db = require('../db');
const config = require('../config');
const { newId } = require('../utils/ids');

function nowIso() {
  return new Date().toISOString();
}

function projectDir(projectId) {
  const dir = path.join(config.paths.outputs, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveOutputBuffer({ jobId, projectId, buffer, ext = '.png', source = 'automation' }) {
  const id = newId('out');
  const safeExt = ext.startsWith('.') ? ext.slice(0, 10) : `.${ext}`.slice(0, 10);
  const filename = `${id}${safeExt}`;
  const target = path.join(projectDir(projectId), filename);
  fs.writeFileSync(target, buffer);

  db.prepare(
    `INSERT INTO outputs
       (id, job_id, project_id, filename, source, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, jobId, projectId, filename, source, buffer.length, nowIso());

  return getOutput(id);
}

function getOutput(id) {
  const row = db.prepare('SELECT * FROM outputs WHERE id = ?').get(id);
  if (!row) {
    throw Object.assign(new Error('output not found'), { status: 404 });
  }
  return row;
}

function listOutputs({ projectId, jobId, limit = 200 } = {}) {
  const clauses = [];
  const params = [];
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(projectId);
  }
  if (jobId) {
    clauses.push('job_id = ?');
    params.push(jobId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT * FROM outputs ${where}
        ORDER BY datetime(created_at) DESC
        LIMIT ?`
    )
    .all(...params, limit);
}

function outputPath(output) {
  return path.join(config.paths.outputs, output.project_id, output.filename);
}

function deleteOutput(id) {
  const out = getOutput(id);
  const p = outputPath(out);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_err) {
    // ignore
  }
  db.prepare('DELETE FROM outputs WHERE id = ?').run(id);
  return { id, deleted: true };
}

module.exports = {
  saveOutputBuffer,
  getOutput,
  listOutputs,
  deleteOutput,
  outputPath,
};
