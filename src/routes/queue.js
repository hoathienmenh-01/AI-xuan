'use strict';

const express = require('express');
const worker = require('../queue/worker');

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json(worker.getStatus());
});

router.post('/pause', (_req, res) => {
  res.json(worker.pause());
});

router.post('/resume', (_req, res) => {
  res.json(worker.resume());
});

module.exports = router;
