'use strict';

const db = require('../db');
const { newId } = require('../utils/ids');
const projects = require('./projects');
const prompts = require('./prompts');
const references = require('./references');

function nowIso() {
  return new Date().toISOString();
}

function parseRefIds(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (_err) {
    return [];
  }
}

function enrichJob(row) {
  if (!row) return row;
  const refIds = parseRefIds(row.reference_ids);
  const refRows = refIds
    .map((id) => {
      try {
        return references.getReference(id);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
  const outputs = db
    .prepare(
      'SELECT * FROM outputs WHERE job_id = ? ORDER BY datetime(created_at) ASC'
    )
    .all(row.id);
  return {
    ...row,
    reference_ids: refIds,
    references: refRows,
    outputs,
  };
}

function enqueueJob({ projectId, promptId, promptBody, referenceIds }) {
  projects.getProject(projectId);

  let promptSnapshot = '';
  if (promptId) {
    const p = prompts.getPrompt(promptId);
    promptSnapshot = prompts.buildFinalPrompt({
      body: p.body,
      style: p.style,
      negative: p.negative,
    });
  } else if (promptBody && String(promptBody).trim()) {
    promptSnapshot = String(promptBody).trim();
  } else {
    throw Object.assign(new Error('promptId or promptBody is required'), {
      status: 400,
    });
  }

  const refIds = Array.isArray(referenceIds) ? referenceIds : [];
  for (const refId of refIds) {
    const r = references.getReference(refId);
    if (r.project_id !== projectId) {
      throw Object.assign(
        new Error(`reference ${refId} does not belong to project ${projectId}`),
        { status: 400 }
      );
    }
  }

  const id = newId('job');
  const now = nowIso();
  db.prepare(
    `INSERT INTO jobs
       (id, project_id, prompt_id, prompt_snapshot, reference_ids,
        status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?)`
  ).run(
    id,
    projectId,
    promptId || null,
    promptSnapshot,
    JSON.stringify(refIds),
    now,
    now
  );
  addEvent(id, 'info', 'job enqueued', {
    prompt_length: promptSnapshot.length,
    references: refIds.length,
  });
  return getJob(id);
}

function listJobs({ projectId, status, limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(projectId);
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT * FROM jobs ${where}
        ORDER BY datetime(created_at) DESC
        LIMIT ?`
    )
    .all(...params, limit);
  return rows.map(enrichJob);
}

function getJob(id) {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!row) {
    throw Object.assign(new Error('job not found'), { status: 404 });
  }
  return enrichJob(row);
}

function claimNextQueuedJob() {
  const tx = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT * FROM jobs WHERE status = 'queued'
          ORDER BY datetime(created_at) ASC LIMIT 1`
      )
      .get();
    if (!row) return null;
    const now = nowIso();
    db.prepare(
      `UPDATE jobs
          SET status = 'running',
              started_at = ?,
              updated_at = ?,
              attempts = attempts + 1
        WHERE id = ? AND status = 'queued'`
    ).run(now, now, row.id);
    return row.id;
  });
  const id = tx();
  return id ? getJob(id) : null;
}

function markSuccess(id) {
  const now = nowIso();
  db.prepare(
    `UPDATE jobs SET status = 'success', finished_at = ?, updated_at = ?,
                     error_message = NULL, error_screenshot = NULL
      WHERE id = ?`
  ).run(now, now, id);
  addEvent(id, 'info', 'job success');
  return getJob(id);
}

function markFailed(id, { errorMessage, errorScreenshot } = {}) {
  const now = nowIso();
  db.prepare(
    `UPDATE jobs SET status = 'failed', finished_at = ?, updated_at = ?,
                     error_message = ?, error_screenshot = ?
      WHERE id = ?`
  ).run(now, now, errorMessage || null, errorScreenshot || null, id);
  addEvent(id, 'error', 'job failed', { errorMessage });
  return getJob(id);
}

function markManualReview(id, { errorMessage, errorScreenshot } = {}) {
  const now = nowIso();
  db.prepare(
    `UPDATE jobs SET status = 'manual_review', updated_at = ?,
                     error_message = ?, error_screenshot = ?
      WHERE id = ?`
  ).run(now, errorMessage || null, errorScreenshot || null, id);
  addEvent(id, 'warn', 'job flipped to manual_review', { errorMessage });
  return getJob(id);
}

function requeueJob(id) {
  const job = getJob(id);
  if (!['failed', 'manual_review', 'cancelled'].includes(job.status)) {
    throw Object.assign(
      new Error(`cannot requeue job in status ${job.status}`),
      { status: 400 }
    );
  }
  const now = nowIso();
  db.prepare(
    `UPDATE jobs SET status = 'queued', updated_at = ?, started_at = NULL,
                     finished_at = NULL, error_message = NULL, error_screenshot = NULL
      WHERE id = ?`
  ).run(now, id);
  addEvent(id, 'info', 'job requeued');
  return getJob(id);
}

function cancelJob(id) {
  const job = getJob(id);
  if (!['queued', 'manual_review'].includes(job.status)) {
    throw Object.assign(
      new Error(`cannot cancel job in status ${job.status}`),
      { status: 400 }
    );
  }
  const now = nowIso();
  db.prepare(
    `UPDATE jobs SET status = 'cancelled', updated_at = ?, finished_at = ?
      WHERE id = ?`
  ).run(now, now, id);
  addEvent(id, 'warn', 'job cancelled');
  return getJob(id);
}

function addEvent(jobId, level, message, meta) {
  let metaJson = '{}';
  try {
    metaJson = JSON.stringify(meta || {});
  } catch (_err) {
    metaJson = '{}';
  }
  db.prepare(
    `INSERT INTO job_events (job_id, level, message, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(jobId, level, message, metaJson, nowIso());
}

function listEvents(jobId) {
  return db
    .prepare(
      `SELECT * FROM job_events WHERE job_id = ?
        ORDER BY id ASC`
    )
    .all(jobId);
}

module.exports = {
  enqueueJob,
  listJobs,
  getJob,
  claimNextQueuedJob,
  markSuccess,
  markFailed,
  markManualReview,
  requeueJob,
  cancelJob,
  addEvent,
  listEvents,
};
