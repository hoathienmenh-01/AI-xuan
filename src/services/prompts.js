'use strict';

const db = require('../db');
const { newId } = require('../utils/ids');
const projects = require('./projects');

function nowIso() {
  return new Date().toISOString();
}

function normalizeExtras(extras) {
  if (!extras) return '{}';
  if (typeof extras === 'string') {
    try {
      JSON.parse(extras);
      return extras;
    } catch (_err) {
      return '{}';
    }
  }
  try {
    return JSON.stringify(extras);
  } catch (_err) {
    return '{}';
  }
}

function buildFinalPrompt({ body, style, negative }) {
  const parts = [];
  if (body && body.trim()) parts.push(body.trim());
  if (style && style.trim()) parts.push(`Style: ${style.trim()}`);
  if (negative && negative.trim()) parts.push(`Avoid: ${negative.trim()}`);
  return parts.join('\n\n');
}

function createPrompt({ projectId, title, body, negative, style, extras }) {
  projects.getProject(projectId);
  if (!body || !String(body).trim()) {
    throw Object.assign(new Error('body is required'), { status: 400 });
  }
  const id = newId('prm');
  const now = nowIso();
  db.prepare(
    `INSERT INTO prompts
       (id, project_id, title, body, negative, style, extras_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectId,
    title || '',
    String(body).trim(),
    negative || '',
    style || '',
    normalizeExtras(extras),
    now,
    now
  );
  return getPrompt(id);
}

function listPrompts(projectId) {
  projects.getProject(projectId);
  return db
    .prepare(
      `SELECT * FROM prompts
        WHERE project_id = ?
        ORDER BY datetime(updated_at) DESC`
    )
    .all(projectId);
}

function getPrompt(id) {
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
  if (!row) {
    throw Object.assign(new Error('prompt not found'), { status: 404 });
  }
  return row;
}

function updatePrompt(id, { title, body, negative, style, extras }) {
  getPrompt(id);
  const now = nowIso();
  db.prepare(
    `UPDATE prompts
        SET title = COALESCE(?, title),
            body  = COALESCE(?, body),
            negative = COALESCE(?, negative),
            style    = COALESCE(?, style),
            extras_json = COALESCE(?, extras_json),
            updated_at = ?
      WHERE id = ?`
  ).run(
    title === undefined ? null : title,
    body === undefined ? null : String(body).trim(),
    negative === undefined ? null : negative,
    style === undefined ? null : style,
    extras === undefined ? null : normalizeExtras(extras),
    now,
    id
  );
  return getPrompt(id);
}

function deletePrompt(id) {
  getPrompt(id);
  db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
  return { id, deleted: true };
}

module.exports = {
  createPrompt,
  listPrompts,
  getPrompt,
  updatePrompt,
  deletePrompt,
  buildFinalPrompt,
};
