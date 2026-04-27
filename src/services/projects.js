'use strict';

const db = require('../db');
const { newId } = require('../utils/ids');

function nowIso() {
  return new Date().toISOString();
}

function createProject({ name, description }) {
  if (!name || !String(name).trim()) {
    throw Object.assign(new Error('name is required'), { status: 400 });
  }
  const id = newId('proj');
  const now = nowIso();
  db.prepare(
    `INSERT INTO projects (id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, String(name).trim(), description || '', now, now);
  return getProject(id);
}

function listProjects() {
  return db
    .prepare('SELECT * FROM projects ORDER BY datetime(updated_at) DESC')
    .all();
}

function getProject(id) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) {
    throw Object.assign(new Error('project not found'), { status: 404 });
  }
  return row;
}

function updateProject(id, { name, description }) {
  getProject(id);
  const now = nowIso();
  db.prepare(
    `UPDATE projects
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           updated_at = ?
     WHERE id = ?`
  ).run(
    name === undefined ? null : String(name).trim(),
    description === undefined ? null : description,
    now,
    id
  );
  return getProject(id);
}

function deleteProject(id) {
  getProject(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return { id, deleted: true };
}

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
};
