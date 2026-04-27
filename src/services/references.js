'use strict';

const fs = require('fs');
const path = require('path');

const db = require('../db');
const config = require('../config');
const { newId } = require('../utils/ids');
const projects = require('./projects');

function nowIso() {
  return new Date().toISOString();
}

function projectDir(projectId) {
  const dir = path.join(config.paths.references, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function addReference({ projectId, label, originalName, mimeType, buffer }) {
  projects.getProject(projectId);
  if (!buffer || !buffer.length) {
    throw Object.assign(new Error('empty upload'), { status: 400 });
  }
  const id = newId('ref');
  const safeExt = path.extname(originalName || '').toLowerCase().slice(0, 10) || '.bin';
  const filename = `${id}${safeExt}`;
  const target = path.join(projectDir(projectId), filename);
  fs.writeFileSync(target, buffer);
  const now = nowIso();
  db.prepare(
    `INSERT INTO references_images
       (id, project_id, label, filename, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    label || '',
    filename,
    originalName || filename,
    mimeType || 'application/octet-stream',
    buffer.length,
    now
  );
  return getReference(id);
}

function listReferences(projectId) {
  projects.getProject(projectId);
  return db
    .prepare(
      `SELECT * FROM references_images
        WHERE project_id = ?
        ORDER BY datetime(created_at) DESC`
    )
    .all(projectId);
}

function getReference(id) {
  const row = db.prepare('SELECT * FROM references_images WHERE id = ?').get(id);
  if (!row) {
    throw Object.assign(new Error('reference not found'), { status: 404 });
  }
  return row;
}

function referencePath(ref) {
  return path.join(config.paths.references, ref.project_id, ref.filename);
}

function deleteReference(id) {
  const ref = getReference(id);
  const p = referencePath(ref);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_err) {
    // ignore filesystem issue; DB row is the source of truth
  }
  db.prepare('DELETE FROM references_images WHERE id = ?').run(id);
  return { id, deleted: true };
}

module.exports = {
  addReference,
  listReferences,
  getReference,
  deleteReference,
  referencePath,
};
