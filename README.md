# Flow Image Production Tool

Local-only assistant for [Google Flow](https://labs.google/fx/vi/tools/flow). It
opens a real Chrome window via Playwright and drives the Flow UI **the same way
a human would**: you sign in to your Google account once, and the tool then
fills in prompts, attaches reference images, clicks generate, waits for the
result, downloads the image, and stores everything in a local SQLite database.

> The tool does **not** bypass authentication, captchas, rate limits, or quota.
> All Google account interaction happens in a normal visible Chrome window that
> you control. If automation gets stuck, the job is flagged for **manual
> recovery** and you can finish it by hand.

## Stack

- Node.js (>= 18)
- Express.js
- SQLite (via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3))
- Playwright (Chromium, persistent profile in `data/browser-profile/`)
- Plain HTML / CSS / JS frontend (no framework, no build step)

Everything runs locally at <http://localhost:3030>.

## Project layout

```
flow-image-production-tool/
├── package.json
├── README.md
├── data/                      # gitignored – local SQLite DB, outputs, refs, screenshots
│   ├── flow.db
│   ├── outputs/<projectId>/
│   ├── references/<projectId>/
│   ├── screenshots/<jobId>/
│   └── browser-profile/        # Playwright persistent Chrome profile (your Google login)
├── logs/                       # app.log, error.log
├── public/                     # frontend
│   ├── index.html
│   ├── css/app.css
│   └── js/{api.js, app.js}
└── src/
    ├── server.js               # Express bootstrap
    ├── config.js               # paths, ports, timeouts
    ├── db/
    │   ├── index.js            # opens better-sqlite3, runs schema
    │   └── schema.sql          # tables: projects, references_images, prompts, jobs, outputs, job_events
    ├── routes/                 # Express routers (one per resource)
    │   ├── projects.js
    │   ├── references.js
    │   ├── prompts.js
    │   ├── jobs.js
    │   ├── outputs.js
    │   ├── queue.js
    │   ├── recovery.js
    │   └── system.js
    ├── services/               # business logic, no Express types
    │   ├── projects.js
    │   ├── references.js
    │   ├── prompts.js
    │   ├── jobs.js
    │   └── outputs.js
    ├── automation/             # Playwright glue
    │   ├── browser.js          # persistent Chromium context (real Chrome, headed)
    │   └── flow.js             # Google Flow primitives (type prompt, attach refs, click generate, download result)
    ├── queue/
    │   └── worker.js           # single-concurrency in-process worker loop
    └── utils/
        ├── logger.js
        └── ids.js
```

## Setup

```bash
# 1. Install JS dependencies
npm install

# 2. Install the Chromium build Playwright will drive.
#    (You only need to do this once per machine.)
npx playwright install chromium

# 3. Run
npm start
# → server listening on http://127.0.0.1:3030
```

Open <http://localhost:3030> in any browser.

## Usage

1. **Create a project** in the *Projects* tab. Everything (references, prompts,
   jobs, outputs) is scoped to a project.
2. Click **Launch Chrome** in the top-right. A real Chrome window opens on
   `https://labs.google/fx/vi/tools/flow`. **Sign in to your Google account
   manually** in that window. The login persists in `data/browser-profile/` so
   you only have to do it once per machine.
3. Click **Verify Flow login** to confirm the tool can see the Flow UI. Fix any
   consent screens / verification prompts in the Chrome window if it complains.
4. Upload one or more **References** (optional) for your project.
5. Author one or more **Prompts** in the prompt builder. The builder accepts a
   main body, an optional style hint, and a negative/avoid list. Use the
   *Preview final prompt* button to see exactly what will be typed into Flow.
6. Go to the **Generate** tab, pick a saved prompt (or type an ad-hoc one),
   tick the references you want to attach, and click **Enqueue job**.
7. Watch the **Jobs** tab. The queue worker picks up one job at a time, drives
   the Flow UI, and downloads any new image into the project's
   `data/outputs/<projectId>/` folder. Successful results show up in the
   **Gallery** tab.

### Job statuses

| Status          | Meaning                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `queued`        | Waiting for the worker.                                                 |
| `running`       | The worker is currently driving Flow for this job.                      |
| `success`       | At least one output image was saved.                                    |
| `failed`        | The worker hit a hard error (kept for transparency).                    |
| `manual_review` | Automation got stuck. A failure screenshot is saved under `data/screenshots/<jobId>/`. Open the job in the UI to see the error and the screenshot. |
| `cancelled`     | You cancelled it before it ran.                                         |

### Manual recovery

When automation can't complete a job (Flow UI changed, Google asked for an
extra verification, network hiccup, etc.) the job moves to **manual_review**
and a screenshot is saved. Open the job in the Jobs tab, finish the
generation by hand in the Chrome window the tool opened, save the resulting
image(s) locally, and use the **Upload manual output(s)** form in the job
modal to attach them. The job flips to **success** and the images appear in
the gallery just like automated outputs.

You can also **Requeue** failed/manual jobs from the Jobs tab to let
automation try again from scratch.

### Pausing the queue

Use the **Pause** / **Resume** buttons in the top bar. Pausing leaves the
current running job (if any) alone but stops new ones from starting.

## Configuration

All configurable values live in [`src/config.js`](src/config.js). Common
overrides via environment variables:

| Variable                    | Default               | Meaning                                      |
| --------------------------- | --------------------- | -------------------------------------------- |
| `PORT`                      | `3030`                | HTTP port.                                   |
| `HOST`                      | `127.0.0.1`           | Bind address.                                |
| `FLOW_GENERATE_TIMEOUT_MS`  | `300000` (5 min)      | How long to wait per generate before flipping the job to `manual_review`. |
| `SKIP_WORKER`               | unset                 | If `1`, the HTTP server starts but no jobs are processed. Useful for read-only / debugging. |
| `DEBUG`                     | unset                 | If set, debug-level logs are written.        |

## Data persistence

- SQLite database: `data/flow.db` (WAL mode, `foreign_keys = ON`).
- References: `data/references/<projectId>/<refId>.<ext>`.
- Outputs:    `data/outputs/<projectId>/<outId>.<ext>`.
- Failure screenshots: `data/screenshots/<jobId>/fail-<timestamp>.png`.
- Persistent Chrome profile (cookies, localStorage, login): `data/browser-profile/`.
- App logs: `logs/app.log`, `logs/error.log`.

Everything under `data/` and `logs/` is gitignored. Back up the entire `data/`
directory to migrate or snapshot your work.

## API summary

All endpoints return JSON. Files (`/api/references/:id/file`,
`/api/outputs/:id/file`, `/api/jobs/:id/screenshot`) stream the underlying
bytes with the appropriate `Content-Type`.

```
GET    /api/system/health
GET    /api/system/browser/status
POST   /api/system/browser/launch
POST   /api/system/browser/close
POST   /api/system/browser/verify-flow

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id

GET    /api/references?projectId=...
POST   /api/references                (multipart: file, projectId, label?)
GET    /api/references/:id
GET    /api/references/:id/file
DELETE /api/references/:id

GET    /api/prompts?projectId=...
POST   /api/prompts
GET    /api/prompts/:id
PATCH  /api/prompts/:id
DELETE /api/prompts/:id
POST   /api/prompts/preview

GET    /api/jobs?projectId=...&status=...
POST   /api/jobs                      ({ projectId, promptId|promptBody, referenceIds })
GET    /api/jobs/:id
GET    /api/jobs/:id/events
POST   /api/jobs/:id/requeue
POST   /api/jobs/:id/cancel
GET    /api/jobs/:id/screenshot

GET    /api/outputs?projectId=...&jobId=...
GET    /api/outputs/:id
GET    /api/outputs/:id/file
DELETE /api/outputs/:id

GET    /api/queue/status
POST   /api/queue/pause
POST   /api/queue/resume

POST   /api/recovery/jobs/:id/manual-output  (multipart: files[])
```

## Why this design

- **Separation of concerns.** `routes/` is HTTP only, `services/` is the
  business layer, `automation/` is Playwright, `queue/` is the worker. You can
  unit-test or swap any layer without touching the others.
- **Single-concurrency queue.** Flow rate-limits aggressively and the user only
  has one Chrome window. The queue runs one job at a time, in submission order.
- **Manual recovery is a first-class state.** Real automation is fragile against
  UI redesigns and Google verification flows. Instead of pretending failures
  don't happen, the tool surfaces them with a screenshot and a one-click upload
  path so the human can finish what the bot couldn't.
- **No login automation.** Google account login is handled exclusively by the
  human in the visible Chrome window. The persistent browser profile under
  `data/browser-profile/` keeps that login between sessions.

## Troubleshooting

- *"Flow prompt input not found."* — You probably aren't signed in, or Flow
  showed a consent / interstitial screen. Switch to the Chrome window the tool
  opened, complete it, and click **Verify Flow login** again.
- *"timed out waiting for new image"* — Generation took longer than
  `FLOW_GENERATE_TIMEOUT_MS`. Either bump the env var or finish the job by hand
  via Manual Recovery.
- *Chrome window won't open* — Make sure you ran `npx playwright install
  chromium` after `npm install`.
- *DB errors after pulling new code* — `schema.sql` is idempotent (`CREATE
  TABLE IF NOT EXISTS`), but for fresh starts you can simply delete `data/flow.db*`.
