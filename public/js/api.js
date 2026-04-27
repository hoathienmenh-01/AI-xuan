'use strict';

// Tiny REST helper. All endpoints are local so we don't bother with auth.

window.API = (() => {
  async function request(method, url, { body, form } = {}) {
    const opts = { method, headers: {} };
    if (form) {
      opts.body = form;
    } else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const msg =
        (data && data.error) || (typeof data === 'string' ? data : 'request failed');
      const err = new Error(`${method} ${url} -> ${res.status}: ${msg}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    projects: {
      list: () => request('GET', '/api/projects'),
      create: (b) => request('POST', '/api/projects', { body: b }),
      get: (id) => request('GET', `/api/projects/${id}`),
      update: (id, b) => request('PATCH', `/api/projects/${id}`, { body: b }),
      remove: (id) => request('DELETE', `/api/projects/${id}`),
    },
    references: {
      list: (projectId) =>
        request('GET', `/api/references?projectId=${encodeURIComponent(projectId)}`),
      upload: (form) => request('POST', '/api/references', { form }),
      remove: (id) => request('DELETE', `/api/references/${id}`),
      fileUrl: (id) => `/api/references/${id}/file`,
    },
    prompts: {
      list: (projectId) =>
        request('GET', `/api/prompts?projectId=${encodeURIComponent(projectId)}`),
      create: (b) => request('POST', '/api/prompts', { body: b }),
      update: (id, b) => request('PATCH', `/api/prompts/${id}`, { body: b }),
      remove: (id) => request('DELETE', `/api/prompts/${id}`),
      preview: (b) => request('POST', '/api/prompts/preview', { body: b }),
    },
    jobs: {
      list: (q = {}) => {
        const params = new URLSearchParams(q).toString();
        return request('GET', `/api/jobs${params ? `?${params}` : ''}`);
      },
      create: (b) => request('POST', '/api/jobs', { body: b }),
      get: (id) => request('GET', `/api/jobs/${id}`),
      events: (id) => request('GET', `/api/jobs/${id}/events`),
      requeue: (id) => request('POST', `/api/jobs/${id}/requeue`),
      cancel: (id) => request('POST', `/api/jobs/${id}/cancel`),
      screenshotUrl: (id) => `/api/jobs/${id}/screenshot`,
    },
    outputs: {
      list: (q = {}) => {
        const params = new URLSearchParams(q).toString();
        return request('GET', `/api/outputs${params ? `?${params}` : ''}`);
      },
      remove: (id) => request('DELETE', `/api/outputs/${id}`),
      fileUrl: (id) => `/api/outputs/${id}/file`,
    },
    queue: {
      status: () => request('GET', '/api/queue/status'),
      pause: () => request('POST', '/api/queue/pause'),
      resume: () => request('POST', '/api/queue/resume'),
    },
    system: {
      health: () => request('GET', '/api/system/health'),
      browserStatus: () => request('GET', '/api/system/browser/status'),
      browserLaunch: () => request('POST', '/api/system/browser/launch'),
      browserClose: () => request('POST', '/api/system/browser/close'),
      verifyFlow: () => request('POST', '/api/system/browser/verify-flow'),
    },
    recovery: {
      manualOutput: (jobId, form) =>
        request('POST', `/api/recovery/jobs/${jobId}/manual-output`, { form }),
    },
  };
})();
