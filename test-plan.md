# Flow Image Production Tool — Test Plan

## Scope

This is the initial scaffold of a local Node.js + Express + SQLite + Playwright tool. The
test plan exercises the end-to-end UI flow that proves the spec is met for everything that
does **not** require the user's personal Google account. The actual Playwright → Google
Flow round trip cannot be exercised here because it deliberately requires the user to
sign in to Google in their own Chrome window — that is the design.

App under test: <http://localhost:3030> (server started with `SKIP_WORKER=1` so no
Playwright work happens; the queue worker is verified separately by inspecting the
manual-recovery path which uses the same `markSuccess` code path as the real worker).

Code references that informed the plan:
- `public/index.html` — tab structure, forms.
- `public/js/app.js:23-32` — tab switching.
- `public/js/app.js:111-128` — project create.
- `public/js/app.js:163-178` — reference upload.
- `public/js/app.js:204-229` — prompt save.
- `public/js/app.js:231-242` — `Preview final prompt` calls `/api/prompts/preview` (`src/services/prompts.js:25-31` `buildFinalPrompt`).
- `public/js/app.js:244-272` — enqueue job (`/api/jobs`).
- `public/js/app.js:359-377` — manual output upload (`/api/recovery/jobs/:id/manual-output` → `src/routes/recovery.js` → `jobs.markSuccess`).
- `src/services/prompts.js:25-31` — final prompt format: `body \n\n Style: <style> \n\n Avoid: <negative>`.

## What I cannot test (escalations first)

- **Playwright → Google Flow round-trip.** The tool requires the user to sign in to Google manually in the visible Chrome window. I do not have the user's Google credentials and the spec explicitly forbids automating login. Result: **untested**. The manual-recovery path (which uses the same `jobs.markSuccess` code path that the worker uses on success) is exercised instead.

## Primary end-to-end flow

One continuous flow exercised in the recording:

| # | Step | Expected (concrete pass/fail) |
|---|------|-------------------------------|
| 1 | On `Projects` tab, fill `Project name = "Recording demo"`, `Description = "QA run"`, click **Create project**. | A new row appears in the table with name `Recording demo`, description `QA run`, and the `Active project` selector at the top updates to `Recording demo`. The `Active project` meta line shows an id starting with `proj_` and an `updated …` timestamp. |
| 2 | Switch to `References` tab. Pick label `swatch`, choose a small PNG (`/tmp/test-ref.png`, generated for the run), click **Upload reference**. | A new card appears in the references grid with the uploaded image preview (visible thumbnail, not a broken image), label `swatch`, and a `… KB` size readout. |
| 3 | Switch to `Prompts` tab. Title `hero`, body `A red panda astronaut on Mars`, style `cinematic`, negative `text, watermark`. Click **Preview final prompt**. | A `<pre>` block appears immediately under the form with **exactly** the text:<br>`A red panda astronaut on Mars`<br>`<blank>`<br>`Style: cinematic`<br>`<blank>`<br>`Avoid: text, watermark` |
| 4 | Click **Save prompt**. | The form clears, the preview block hides, and a new entry appears in `Saved prompts` whose first line is `hero` and whose snippet starts with `A red panda astronaut on Mars`. |
| 5 | Switch to `Generate` tab. In `Use saved prompt`, pick `hero`. Tick the `swatch` reference checkbox. Click **Enqueue job**. | The UI auto-switches to the `Jobs` tab. A new row appears at the top with status badge `queued`, `Refs = 1`, `Outputs = 0`, and a `prompt` cell containing `A red panda astronaut on Mars`. |
| 6 | Click **Open** on that job. | A modal opens whose title contains `Job job_…` and `queued`. The body shows a `Status: queued`, the prompt text, and an `Events:` section with at least one `INFO worker picked up job` or `INFO job enqueued` line (`info  job enqueued` is logged in `src/services/jobs.js:enqueueJob`). |
| 7 | Inside the modal, in `Upload manual output(s)` pick the same PNG file, click submit. | The modal closes. In the `Jobs` table the same job's status badge changes to `success` and `Outputs = 1`. |
| 8 | Switch to `Gallery` tab. | A new card appears with the uploaded image preview, source `manual`, a `Download` link, and a `Delete` button. The download link points at `/api/outputs/<id>/file`. |

### Why each step would FAIL on a broken implementation
- Step 1 would fail if the projects API or the project-select wiring were broken — a row could exist in the table while the dropdown stayed at `(no projects yet)`.
- Step 2 would fail if `multer` storage or file streaming were misconfigured: the thumbnail would be a broken image icon.
- Step 3 is the strongest assertion of the prompt builder: if `buildFinalPrompt` was wrong (e.g. wrong joiner, wrong label) the preview text would not match exactly.
- Step 5 specifically verifies that the project, the saved prompt, and the chosen reference are all wired up: a broken FK or a broken `referenceIds` body would either show `Refs = 0` or fail outright.
- Step 7 verifies the manual-recovery → `markSuccess` path. If the route or service were broken, the status would stay at `queued`/`manual_review` instead of flipping to `success`, or `Outputs` would stay at `0`.

## Regression / smoke (not in primary recording)

- `GET /api/system/health` returns `{"ok":true,...}` (already verified during scaffolding before recording started).
- API smoke (already run before recording): create project, create prompt, preview prompt, enqueue job, list jobs all return 2xx and the expected JSON shapes.

## Out of scope (explicitly)

- Real Google Flow generation (untested, see escalations).
- Job worker successful path against Flow (untested for the same reason). The success state is exercised through manual recovery, which uses the same `jobs.markSuccess` function.
- Cross-browser testing (the tool is local-only and only ever runs against the user's Chromium).
