'use strict';

const express = require('express');
const projects = require('../services/projects');

const router = express.Router();

router.get('/', (_req, res, next) => {
  try {
    res.json(projects.listProjects());
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    res.status(201).json(projects.createProject({ name, description }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json(projects.getProject(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    res.json(projects.updateProject(req.params.id, { name, description }));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    res.json(projects.deleteProject(req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
