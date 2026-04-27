'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    projects: [],
    activeProjectId: localStorage.getItem('activeProjectId') || null,
    references: [],
    prompts: [],
    jobs: [],
    outputs: [],
  };

  function setActiveProject(id) {
    state.activeProjectId = id;
    if (id) localStorage.setItem('activeProjectId', id);
    refreshProjectScopedData();
  }

  // ---- tabs ----
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $$('.tab-panel').forEach((p) =>
        p.classList.toggle('hidden', p.dataset.tabPanel !== tab)
      );
    });
  });

  // ---- projects ----
  async function loadProjects() {
    state.projects = await API.projects.list();
    renderProjectSelect();
    renderProjectsTable();
  }

  function renderProjectSelect() {
    const sel = $('#project-select');
    sel.innerHTML = '';
    if (!state.projects.length) {
      const opt = document.createElement('option');
      opt.textContent = '(no projects yet)';
      opt.value = '';
      sel.appendChild(opt);
      state.activeProjectId = null;
      $('#active-project-meta').textContent = '';
      return;
    }
    for (const p of state.projects) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    }
    if (
      !state.activeProjectId ||
      !state.projects.find((p) => p.id === state.activeProjectId)
    ) {
      state.activeProjectId = state.projects[0].id;
      localStorage.setItem('activeProjectId', state.activeProjectId);
    }
    sel.value = state.activeProjectId;
    const active = state.projects.find((p) => p.id === state.activeProjectId);
    $('#active-project-meta').textContent = active
      ? `id ${active.id} · updated ${active.updated_at}`
      : '';
  }

  $('#project-select').addEventListener('change', (e) =>
    setActiveProject(e.target.value)
  );

  function renderProjectsTable() {
    const tbody = $('#projects-table tbody');
    tbody.innerHTML = '';
    for (const p of state.projects) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.description || '')}</td>
        <td class="muted">${escapeHtml(p.updated_at)}</td>
        <td>
          <button class="btn" data-act="use" data-id="${p.id}">Use</button>
          <button class="btn btn-danger" data-act="del" data-id="${p.id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    }
    tbody.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const { act, id } = btn.dataset;
      if (act === 'use') {
        setActiveProject(id);
      } else if (act === 'del') {
        if (!confirm('Delete project and all of its references/prompts/jobs?')) return;
        await API.projects.remove(id);
        await loadProjects();
        await refreshProjectScopedData();
      }
    };
  }

  $('#project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const created = await API.projects.create({
        name: fd.get('name'),
        description: fd.get('description'),
      });
      form.reset();
      await loadProjects();
      setActiveProject(created.id);
    } catch (err) {
      alert(err.message);
    }
  });

  // ---- references ----
  async function loadReferences() {
    if (!state.activeProjectId) {
      state.references = [];
    } else {
      state.references = await API.references.list(state.activeProjectId);
    }
    renderReferences();
    renderGenerateRefs();
  }

  function renderReferences() {
    const grid = $('#references-grid');
    grid.innerHTML = '';
    for (const r of state.references) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <img src="${API.references.fileUrl(r.id)}" alt="${escapeHtml(r.label)}" />
        <div class="card-body">
          <div><strong>${escapeHtml(r.label || r.original_name)}</strong></div>
          <div class="muted">${(r.size_bytes / 1024).toFixed(1)} KB</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-danger" data-act="del" data-id="${r.id}">Delete</button>
        </div>`;
      grid.appendChild(div);
    }
    grid.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'del') {
        if (!confirm('Delete reference?')) return;
        await API.references.remove(btn.dataset.id);
        await loadReferences();
      }
    };
  }

  $('#reference-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeProjectId) {
      alert('Pick a project first.');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.append('projectId', state.activeProjectId);
    try {
      await API.references.upload(fd);
      form.reset();
      await loadReferences();
    } catch (err) {
      alert(err.message);
    }
  });

  // ---- prompts ----
  async function loadPrompts() {
    if (!state.activeProjectId) {
      state.prompts = [];
    } else {
      state.prompts = await API.prompts.list(state.activeProjectId);
    }
    renderPrompts();
    renderGeneratePromptSelect();
  }

  function renderPrompts() {
    const ul = $('#prompts-list');
    ul.innerHTML = '';
    for (const p of state.prompts) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <div><strong>${escapeHtml(p.title || '(untitled)')}</strong></div>
          <div class="muted">${escapeHtml((p.body || '').slice(0, 140))}</div>
        </div>
        <div>
          <button class="btn" data-act="use" data-id="${p.id}">Use</button>
          <button class="btn btn-danger" data-act="del" data-id="${p.id}">Delete</button>
        </div>`;
      ul.appendChild(li);
    }
    ul.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const p = state.prompts.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      if (btn.dataset.act === 'use') {
        switchTab('generate');
        $('#generate-prompt-select').value = p.id;
        $('#generate-prompt-body').value = p.body || '';
      } else if (btn.dataset.act === 'del') {
        if (!confirm('Delete prompt?')) return;
        await API.prompts.remove(p.id);
        await loadPrompts();
      }
    };
  }

  $('#prompt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeProjectId) {
      alert('Pick a project first.');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await API.prompts.create({
        projectId: state.activeProjectId,
        title: fd.get('title'),
        body: fd.get('body'),
        style: fd.get('style'),
        negative: fd.get('negative'),
      });
      form.reset();
      $('#prompt-preview-out').classList.add('hidden');
      await loadPrompts();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#prompt-preview').addEventListener('click', async () => {
    const form = document.getElementById('prompt-form');
    const fd = new FormData(form);
    try {
      const { final } = await API.prompts.preview({
        body: fd.get('body'),
        style: fd.get('style'),
        negative: fd.get('negative'),
      });
      const out = $('#prompt-preview-out');
      out.textContent = final;
      out.classList.remove('hidden');
    } catch (err) {
      alert(err.message);
    }
  });

  // ---- generate ----
  function renderGeneratePromptSelect() {
    const sel = $('#generate-prompt-select');
    sel.innerHTML = '<option value="">— ad-hoc prompt below —</option>';
    for (const p of state.prompts) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title || (p.body || '').slice(0, 60) || '(untitled)';
      sel.appendChild(opt);
    }
  }

  function renderGenerateRefs() {
    const div = $('#generate-refs');
    div.innerHTML = '';
    if (!state.references.length) {
      div.innerHTML = '<span class="muted">No references in this project yet.</span>';
      return;
    }
    for (const r of state.references) {
      const label = document.createElement('label');
      label.className = 'ref-checkbox';
      label.innerHTML = `
        <input type="checkbox" value="${r.id}" />
        <img src="${API.references.fileUrl(r.id)}" alt="" />
        <span>${escapeHtml(r.label || r.original_name)}</span>`;
      div.appendChild(label);
    }
  }

  $('#generate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeProjectId) {
      alert('Pick a project first.');
      return;
    }
    const promptId = $('#generate-prompt-select').value || null;
    const promptBody = $('#generate-prompt-body').value.trim();
    const referenceIds = $$('#generate-refs input[type="checkbox"]:checked').map(
      (c) => c.value
    );
    if (!promptId && !promptBody) {
      alert('Pick a saved prompt or type one in.');
      return;
    }
    try {
      await API.jobs.create({
        projectId: state.activeProjectId,
        promptId,
        promptBody: promptId ? undefined : promptBody,
        referenceIds,
      });
      switchTab('jobs');
      await loadJobs();
    } catch (err) {
      alert(err.message);
    }
  });

  // ---- jobs ----
  async function loadJobs() {
    const opts = state.activeProjectId ? { projectId: state.activeProjectId } : {};
    state.jobs = await API.jobs.list(opts);
    renderJobs();
  }

  function renderJobs() {
    const tbody = $('#jobs-table tbody');
    tbody.innerHTML = '';
    for (const j of state.jobs) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="tag tag-status-${j.status}">${j.status}</span></td>
        <td class="muted">${escapeHtml(j.created_at)}</td>
        <td>${escapeHtml((j.prompt_snapshot || '').slice(0, 100))}</td>
        <td>${(j.references || []).length}</td>
        <td>${(j.outputs || []).length}</td>
        <td>
          <button class="btn" data-act="open" data-id="${j.id}">Open</button>
          ${j.status === 'queued' || j.status === 'manual_review'
            ? `<button class="btn" data-act="cancel" data-id="${j.id}">Cancel</button>`
            : ''}
          ${j.status === 'failed' || j.status === 'manual_review' || j.status === 'cancelled'
            ? `<button class="btn" data-act="requeue" data-id="${j.id}">Requeue</button>`
            : ''}
        </td>`;
      tbody.appendChild(tr);
    }
    tbody.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const { act, id } = btn.dataset;
      try {
        if (act === 'cancel') {
          await API.jobs.cancel(id);
          await loadJobs();
        } else if (act === 'requeue') {
          await API.jobs.requeue(id);
          await loadJobs();
        } else if (act === 'open') {
          openJobModal(id);
        }
      } catch (err) {
        alert(err.message);
      }
    };
  }

  async function openJobModal(jobId) {
    const job = await API.jobs.get(jobId);
    const events = await API.jobs.events(jobId).catch(() => []);
    $('#job-modal-title').textContent = `Job ${jobId} · ${job.status}`;
    const lines = [];
    lines.push(`Status: ${job.status}`);
    lines.push(`Created: ${job.created_at}`);
    if (job.error_message) lines.push(`Error: ${job.error_message}`);
    lines.push('');
    lines.push('Prompt:');
    lines.push(job.prompt_snapshot || '');
    lines.push('');
    lines.push('Events:');
    for (const ev of events) {
      lines.push(`  [${ev.created_at}] ${ev.level} ${ev.message} ${ev.meta_json}`);
    }
    $('#job-modal-body').textContent = lines.join('\n');

    const shotDiv = $('#job-modal-screenshot');
    shotDiv.innerHTML = '';
    if (job.error_screenshot) {
      const img = document.createElement('img');
      img.src = API.jobs.screenshotUrl(jobId);
      img.alt = 'failure screenshot';
      shotDiv.appendChild(img);
    }
    const form = $('#manual-output-form');
    form.dataset.jobId = jobId;
    $('#job-modal').classList.remove('hidden');
  }
  $('#job-modal-close').addEventListener('click', () =>
    $('#job-modal').classList.add('hidden')
  );
  $('#manual-output-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const jobId = form.dataset.jobId;
    const fd = new FormData(form);
    if (!fd.getAll('files').length) {
      alert('Pick at least one image file.');
      return;
    }
    try {
      await API.recovery.manualOutput(jobId, fd);
      $('#job-modal').classList.add('hidden');
      await Promise.all([loadJobs(), loadOutputs()]);
    } catch (err) {
      alert(err.message);
    }
  });

  // ---- outputs ----
  async function loadOutputs() {
    const opts = state.activeProjectId ? { projectId: state.activeProjectId } : {};
    state.outputs = await API.outputs.list(opts);
    renderOutputs();
  }
  function renderOutputs() {
    const grid = $('#gallery-grid');
    grid.innerHTML = '';
    for (const o of state.outputs) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <img src="${API.outputs.fileUrl(o.id)}" alt="" />
        <div class="card-body">
          <div class="muted">${escapeHtml(o.created_at)}</div>
          <div class="muted">${o.source}</div>
        </div>
        <div class="card-actions">
          <a class="btn" href="${API.outputs.fileUrl(o.id)}" download>Download</a>
          <button class="btn btn-danger" data-act="del" data-id="${o.id}">Delete</button>
        </div>`;
      grid.appendChild(div);
    }
    grid.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'del') {
        if (!confirm('Delete output image?')) return;
        await API.outputs.remove(btn.dataset.id);
        await loadOutputs();
      }
    };
  }

  // ---- queue + browser ----
  async function refreshQueueStatus() {
    try {
      const s = await API.queue.status();
      const tag = $('#queue-status');
      tag.textContent = `queue: ${s.paused ? 'paused' : s.running ? 'running' : 'idle'} (${s.queued} queued)`;
      tag.className = 'tag ' + (s.running ? 'tag-status-running' : 'tag-muted');
    } catch (_e) {
      // ignore
    }
  }
  $('#btn-pause').addEventListener('click', async () => {
    await API.queue.pause();
    refreshQueueStatus();
  });
  $('#btn-resume').addEventListener('click', async () => {
    await API.queue.resume();
    refreshQueueStatus();
  });
  $('#btn-launch-browser').addEventListener('click', async () => {
    try {
      await API.system.browserLaunch();
      alert('Chrome launched. Sign in to Google and load Flow, then come back.');
    } catch (err) {
      alert(err.message);
    }
  });
  $('#btn-verify-flow').addEventListener('click', async () => {
    try {
      const res = await API.system.verifyFlow();
      if (res && res.ok === false) alert(`Not ready: ${res.error}`);
      else alert('Flow page is ready.');
    } catch (err) {
      alert(err.message);
    }
  });

  // ---- shared ----
  function refreshProjectScopedData() {
    return Promise.all([loadReferences(), loadPrompts(), loadJobs(), loadOutputs()]);
  }
  function switchTab(tab) {
    const btn = $(`.tab[data-tab="${tab}"]`);
    if (btn) btn.click();
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- boot ----
  loadProjects().then(refreshProjectScopedData);
  refreshQueueStatus();
  setInterval(refreshQueueStatus, 3000);
  setInterval(() => {
    // light polling of jobs/outputs while the jobs/gallery tabs may be open
    loadJobs().catch(() => {});
    loadOutputs().catch(() => {});
  }, 4000);
})();
