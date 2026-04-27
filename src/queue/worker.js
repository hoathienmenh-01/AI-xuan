'use strict';

const config = require('../config');
const logger = require('../utils/logger');

const jobsService = require('../services/jobs');
const referencesService = require('../services/references');
const outputsService = require('../services/outputs');
const flow = require('../automation/flow');

const state = {
  running: false,
  paused: false,
  currentJobId: null,
};

let tickHandle = null;

function getStatus() {
  return {
    running: state.running,
    paused: state.paused,
    currentJobId: state.currentJobId,
    queued: jobsService.listJobs({ status: 'queued', limit: 1 }).length,
  };
}

function pause() {
  state.paused = true;
  logger.info('queue: paused');
  return getStatus();
}

function resume() {
  state.paused = false;
  logger.info('queue: resumed');
  return getStatus();
}

async function processOne() {
  if (state.running || state.paused) return;
  const job = jobsService.claimNextQueuedJob();
  if (!job) return;
  state.running = true;
  state.currentJobId = job.id;

  logger.info('queue: starting job', { id: job.id });
  jobsService.addEvent(job.id, 'info', 'worker picked up job');

  try {
    const referencePaths = (job.references || []).map((r) =>
      referencesService.referencePath(r)
    );
    const onEvent = (level, message, meta) =>
      jobsService.addEvent(job.id, level, message, meta);

    const { images } = await flow.runGenerateJob({
      jobId: job.id,
      prompt: job.prompt_snapshot,
      referencePaths,
      onEvent,
    });

    for (const img of images) {
      outputsService.saveOutputBuffer({
        jobId: job.id,
        projectId: job.project_id,
        buffer: img.buffer,
        ext: img.ext,
        source: 'automation',
      });
    }

    jobsService.markSuccess(job.id);
    logger.info('queue: job success', { id: job.id, outputs: images.length });
  } catch (err) {
    logger.error('queue: job failed', { id: job.id, error: err.message });
    let screenshot = null;
    try {
      screenshot = await flow.takeScreenshot(job.id, 'fail');
    } catch (_err) {
      // ignore
    }
    jobsService.markManualReview(job.id, {
      errorMessage: err.message,
      errorScreenshot: screenshot,
    });
  } finally {
    state.running = false;
    state.currentJobId = null;
  }
}

function start() {
  if (tickHandle) return;
  logger.info('queue: worker started', { concurrency: config.queue.concurrency });
  const tick = () => {
    processOne()
      .catch((err) => {
        logger.error('queue: tick crashed', { error: err.message });
        state.running = false;
        state.currentJobId = null;
      })
      .finally(() => {
        tickHandle = setTimeout(tick, config.queue.tickMs);
      });
  };
  tickHandle = setTimeout(tick, config.queue.tickMs);
}

function stop() {
  if (tickHandle) {
    clearTimeout(tickHandle);
    tickHandle = null;
  }
}

module.exports = {
  start,
  stop,
  pause,
  resume,
  getStatus,
};
