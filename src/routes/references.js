'use strict';

const fs = require('fs');
const express = require('express');
const multer = require('multer');

const references = require('../services/references');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

router.get('/', (req, res, next) => {
  try {
    const projectId = req.query.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    res.json(references.listReferences(String(projectId)));
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), (req, res, next) => {
  try {
    const { projectId, label } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file is required (field "file")' });
    }
    const ref = references.addReference({
      projectId,
      label,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });
    res.status(201).json(ref);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json(references.getReference(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file', (req, res, next) => {
  try {
    const ref = references.getReference(req.params.id);
    const p = references.referencePath(ref);
    if (!fs.existsSync(p)) {
      return res.status(404).json({ error: 'file missing on disk' });
    }
    res.setHeader('Content-Type', ref.mime_type || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    res.json(references.deleteReference(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
