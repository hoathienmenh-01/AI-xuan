'use strict';

const fs = require('fs');
const path = require('path');

const express = require('express');

const jobs = require('../services/jobs');
const config = require('../config');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const { projectId, status } = req.query;
    res.json(
      jobs.listJobs({
        projectId: projectId ? String(projectId) : undefined,
        status: status ? String(status) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { projectId, promptId, promptBody, referenceIds } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    res.status(201).json(
      jobs.enqueueJob({ projectId, promptId, promptBody, referenceIds })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json(jobs.getJob(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/events', (req, res, next) => {
  try {
    res.json(jobs.listEvents(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/requeue', (req, res, next) => {
  try {
    res.json(jobs.requeueJob(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', (req, res, next) => {
  try {
    res.json(jobs.cancelJob(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/screenshot', (req, res, next) => {
  try {
    const job = jobs.getJob(req.params.id);
    if (!job.error_screenshot) {
      return res.status(404).json({ error: 'no screenshot for this job' });
    }
    const abs = path.join(config.paths.data, job.error_screenshot);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: 'screenshot file missing on disk' });
    }
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
