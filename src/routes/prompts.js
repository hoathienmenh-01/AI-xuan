'use strict';

const express = require('express');
const prompts = require('../services/prompts');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const projectId = req.query.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    res.json(prompts.listPrompts(String(projectId)));
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { projectId, title, body, negative, style, extras } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    res.status(201).json(
      prompts.createPrompt({ projectId, title, body, negative, style, extras })
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json(prompts.getPrompt(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const { title, body, negative, style, extras } = req.body || {};
    res.json(prompts.updatePrompt(req.params.id, { title, body, negative, style, extras }));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    res.json(prompts.deletePrompt(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/preview', (req, res, next) => {
  try {
    const { body, style, negative } = req.body || {};
    res.json({ final: prompts.buildFinalPrompt({ body, style, negative }) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
