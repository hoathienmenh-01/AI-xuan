'use strict';

const fs = require('fs');
const express = require('express');

const outputs = require('../services/outputs');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const { projectId, jobId } = req.query;
    res.json(
      outputs.listOutputs({
        projectId: projectId ? String(projectId) : undefined,
        jobId: jobId ? String(jobId) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json(outputs.getOutput(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file', (req, res, next) => {
  try {
    const out = outputs.getOutput(req.params.id);
    const p = outputs.outputPath(out);
    if (!fs.existsSync(p)) {
      return res.status(404).json({ error: 'file missing on disk' });
    }
    const ext = (out.filename.split('.').pop() || '').toLowerCase();
    const ct =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/png';
    res.setHeader('Content-Type', ct);
    fs.createReadStream(p).pipe(res);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    res.json(outputs.deleteOutput(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
