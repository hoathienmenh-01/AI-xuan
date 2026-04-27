'use strict';

// Manual recovery: when automation fails on a job, the operator can complete
// the generation in the Flow UI themselves and upload the resulting images
// here. The job is marked successful and the images are saved as outputs just
// like the automated path.

const express = require('express');
const multer = require('multer');

const jobs = require('../services/jobs');
const outputs = require('../services/outputs');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

router.post('/jobs/:id/manual-output', upload.array('files', 10), (req, res, next) => {
  try {
    const job = jobs.getJob(req.params.id);
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'at least one file is required' });
    }
    const saved = [];
    for (const f of req.files) {
      const ext = (f.originalname.split('.').pop() || 'png').toLowerCase();
      const out = outputs.saveOutputBuffer({
        jobId: job.id,
        projectId: job.project_id,
        buffer: f.buffer,
        ext: `.${ext}`,
        source: 'manual',
      });
      saved.push(out);
    }
    jobs.addEvent(job.id, 'info', 'manual outputs uploaded', {
      count: saved.length,
    });
    const updated = jobs.markSuccess(job.id);
    res.json({ job: updated, outputs: saved });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
