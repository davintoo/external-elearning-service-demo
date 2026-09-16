# External e-learning service demo — design

Date: 2026-09-15
Status: implemented on `feat/external-service-demo` — where this document and the code differ, the code is authoritative
Scope: this repository (`external-elearning-service-demo`), greenfield

## Goal

A runnable reference implementation of the **external service** side of the LMS feature
"Receive data from an external resource" (`cbr-api2`, `src/modules/resources`). It shows a
client developer, end to end, what their simulator has to do: get launched in an LMS iframe
with one opaque UUID, fetch the learner's context server-to-server, let the learner work
through a checklist, and report the result back so the LMS applies it to the task exactly as
it applies SCORM results.

The LMS owns the learner, the attempt, the threshold and the final mark. This app owns
nothing but its own content and the learner's answers to it.

The contract being demonstrated is published as
[`contract/external-resources-api.schema.json`](../../../contract/external-resources-api.schema.json)
(copied verbatim from `cbr-api2/docs/api/external-resources-api.schema.json`) and specified in
`cbr-api2/docs/superpowers/specs/2026-09-08-external-resource-data-api-design.md`.

## Terminology

| Term | Meaning |
| --- | --- |
| LMS | `cbr-api2`, the system that launches us and stores the result |
| External service | This demo — the vendor's simulator |
| `session_id` | UUID v4 the LMS mints per attempt and puts on our launch URL |
| Session (LMS) | One learner's run of the resource; equals one attempt. Minted by the LMS only |
| Session (local) | This app's LocalStorage record of one launch: the answers filled in so far |

## 1. Architecture

```
external-elearning-service-demo/
├── api/        Node + Express. Holds the API token, owns the LMS contract
├── web/        Angular 22 standalone + signals. The simulator UI, shown in the iframe
├── contract/   external-resources-api.schema.json — the published contract, used by tests
└── docs/       this spec and the implementation plan
```

**Why the Node API exists.** Every LMS call carries
`x-cbr-authorization: Bearer <api-token>` and is server-to-server by design. A token shipped
to the browser is a token handed to every learner, who could then post any mark onto any
session they can see. So the browser never talks to the LMS: it talks to our API, which is
the only holder of the token.

That split is not demo scaffolding — it is the shape any real integration must have, and it
is the single most important thing this repo demonstrates.

### 1.1 Our own HTTP surface

Consumed by our Angular app only. Deliberately *not* a mirror of the LMS API — it speaks in
terms of what the UI has (answers) rather than what the contract needs (payloads).

| Route | Purpose |
| --- | --- |
| `GET /api/config` | `{mode: 'mock' \| 'live'}` — drives the mode banner |
| `GET /api/checklist` | The criteria this simulator assesses: `{title, items: [{id, group, text, weight}]}` |
| `GET /api/session/:sessionId` | Launch context. Proxies LMS `GET /api/v2/external-resources/sessions/{id}` |
| `POST /api/session/:sessionId/result` | Body `{answers: {[itemId]: 'yes'\|'no'\|'na'}, comments: {[itemId]: string}}`. Builds the contract payload, calls LMS `POST /api/v2/external-resources/sessions/result` |
| `GET /demo/lms` | Mock LMS host page — embeds the simulator in a real iframe |

`POST /api/session/:id/result` responds with:

```json
{
  "sent": { "session_id": "…", "status": "completed", "mark": 75, "data": { "format": "checklist", "items": [] } },
  "received": { "data": { "session_id": "…", "status": "fail", "mark": 75, "threshold": 80, "task_status": "fail", "task_mark": 75, "updated_at": "…" } }
}
```

Echoing the exact bytes sent in both directions is the point of the demo: an integrator can
read the payload their own answers produced, not a description of it.

### 1.2 Why the payload is built server-side

The client sends raw answers; the API maps them to `format: "checklist"` items and computes
the mark. Two reasons:

1. The contract shape and the mark rule are integration concerns and belong next to the
   token, in the one place that knows what the LMS expects.
2. The item weights live in the API's checklist definition, so a browser cannot claim a mark
   that does not follow from its answers.

### 1.3 Mock and live modes

Two interchangeable clients — `MockLmsClient` and `LiveLmsClient` — chosen at startup by
`createLmsClient()` on whether `LMS_BASE_URL` and `LMS_API_TOKEN` are both set. They share a
shape (`getSession`, `saveResult`), not a declared interface; in plain JS a named interface
would be commentary, and the shared shape is enforced by both being exercised through the
same routes.

- **live** — HTTP to the LMS with the token header.
- **mock** — in-memory session store, no network. Default, so `npm install && npm start`
  gives a working demo with no LMS, no technical user, no token.

The mock is not a stub that says yes. It enforces what the LMS enforces — the published
`session_id` pattern (lowercase, unbraced, v4), the incoming status enum, `mark` 0–100, 1 MB
serialised `data`, 1–1000 items, required `id`/`text`/`value` per item — and applies the
threshold rule so a `completed` below threshold comes back as `fail`. A payload the mock
accepts is a payload `cbr-api2` accepts; that is what makes it useful to develop against.

## 2. Flow

### 2.1 Launch in the iframe

The LMS renders the URL resource in an iframe with `session_id` appended to whatever query
string the administrator configured (`resource-execute-ctrl.js:_appendSessionId`). Angular
reads `session_id` from `window.location.search`.

**No `session_id`** → a dedicated screen explaining the app must be launched from an LMS
task, with a link to the mock LMS host page in mock mode. Someone always opens the URL
directly; a blank screen or a crash there reads as a broken integration.

### 2.2 Learner context

`GET /api/session/:id` → name, login, language, attempt N of M, threshold, deadline.
Rendered as a header card visible on every screen, so it is obvious the vendor learns who
the learner is without anything but a UUID crossing in the URL.

### 2.3 Sessions list

LocalStorage key `demo.sessions`, an array of:

```ts
{
  sessionId: string,
  startedAt: string,       // ISO
  updatedAt: string,       // ISO
  status: 'in-progress' | 'finished',
  answers: Record<string, 'yes' | 'no' | 'na'>,
  comments: Record<string, string>,
  lastResult: ResultResponse | null
}
```

One row per `session_id` this browser has been launched with. The current one is marked. The
list is the app's only persistence — a real external service would have a database; this one
deliberately does not, which keeps the LMS contract the only integration surface.

**Storage is partitioned or unavailable.** In a third-party iframe, LocalStorage is
partitioned per top-level site by every current browser, and blocked outright in some privacy
modes. Every access goes through a store service that falls back to an in-memory map when
`localStorage` throws or is absent, and the UI shows a one-line notice that history will not
survive a reload. Without this the demo dies on Safari in a way that looks like our bug.

### 2.4 Create or resume

| Current `session_id` | UI |
| --- | --- |
| Not in the store | **Start** — creates the local row, opens an empty checklist |
| Present, `in-progress` | **Resume** — reopens with the saved answers restored |
| Present, `finished` | **Send again** — reopens the stored answers in the editable checklist |

*Send again* is not a loophole: the contract makes `session_id` the idempotency key and
explicitly allows a finished session to be updated (§4.3), with every change logged to SIEM
on the LMS side. The UI says exactly that, because an integrator needs to know it is allowed
and audited rather than discovering it by accident.

The LMS attempt does not change — the same `session_id` is the same attempt. Only a fresh
launch from the LMS mints a new one.

### 2.5 Submit

Finish → `POST /api/session/:id/result`. The API builds:

```json
{
  "session_id": "<from the path>",
  "status": "completed",
  "mark": 75,
  "data": {
    "format": "checklist",
    "title": "<checklist title>",
    "items": [
      {"id": "c1", "order": 1, "group": "Preparation", "text": "PPE checked",
       "value": "yes", "weight": 1, "score": 1}
    ]
  }
}
```

A non-empty comment on an item is sent as that item's `comment`; an empty one is omitted
rather than sent as `""`.

**Mark**: `round(100 × Σ weight(yes) / Σ weight(yes|no))`. Items answered `na` are excluded
from both sides — a criterion that did not apply must not count as a failure. All `na` →
`mark: 0` with `status: "completed"`, since nothing was assessed. Per-item `score` is
`weight` for `yes`, `0` for `no`, omitted for `na`; the contract states per-item scores are
informational and the session mark comes from the top-level field, never from summing them.

**Status is always `completed`**, never `passed`/`failed`. The LMS re-evaluates a terminal
status against the task threshold, so the vendor must not duplicate that rule. Watching a
`completed` come back as `fail` with `threshold: 80` is the clearest available demonstration
of §4.2, and the finish screen calls it out.

### 2.6 Finish screen

LMS-returned `status`, `mark`, `threshold`, `task_status`, `task_mark`, `updated_at`. Below,
a collapsed panel with the raw JSON of both directions. The local row is marked `finished`
and `lastResult` stored.

The screen calls out a `fail` verdict specifically, rather than any sent-vs-returned
difference. Since the service always sends `completed`, the two *always* differ; the moment
worth explaining is the one where the LMS overrode the vendor's report against the threshold.

## 3. Errors

The contract's error table is the specification for this. Each maps to its own message:

| Code | Key | Message shown |
| --- | --- | --- |
| 400 | `validation_error` | Which field the LMS rejected, from the per-field body |
| 401 | `unauthorized` | Our API token is missing, unknown or expired — a service misconfiguration, not a learner problem |
| 403 | `forbidden` | The token's role lacks `pages.can_send_external_resource_data` |
| 404 | `not_found` | Unknown session, another site's session, or a deleted one |
| 409 | `resource_not_external` | The administrator turned the option off |
| 410 | `session_expired` | The task deadline passed — the answers stay in LocalStorage, nothing is lost |
| 429 | `too_many_requests` | Rate limited. The demo reports it and stops; it does not retry — see §8 |

A demo that only walks the happy path teaches nothing about the failure modes an integrator
will actually hit. In mock mode `/demo/lms?force=410` (and each other code) forces the
branch, so all of them are demonstrable without breaking anything on the LMS side.

Network failure and non-JSON responses map to a single "could not reach the LMS" state with
the answers preserved — never a lost checklist.

## 4. Embedding

- No `X-Frame-Options: DENY`. `Content-Security-Policy: frame-ancestors` is built from
  `ALLOWED_FRAME_ANCESTORS` (space-separated origins, default `'self'`). That default already
  covers the mock host page, which is served from the same origin as the simulator in both
  the built single-port mode and behind the dev proxy. A real LMS on another origin has to be
  named explicitly.
- The mock LMS host page embeds the simulator with a generated v4 UUID, so step 1 of the flow
  is a real cross-document iframe, not a simulation of one.

## 5. Configuration

`config/.env` (`.env.example` committed). The path is resolved from the source module, not
from `process.cwd()`, so it is the same file however the process is started; `ENV_FILE`
overrides it. The directory is deliberately separate from `api/`: a secret bind-mounted as
a directory replaces its target, and any target under `api/` would hide the source tree.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENV_FILE` | `config/.env` | Path to the env file to load |
| `PORT` | `3000` | API port; also serves the built Angular app |
| `LMS_BASE_URL` | — | e.g. `https://site.example.com`. Set both this and the token for live mode |
| `LMS_API_TOKEN` | — | API token of a technical user holding `pages.can_send_external_resource_data` |
| `ALLOWED_FRAME_ANCESTORS` | `'self'` | Origins allowed to embed the simulator |

The README documents the LMS-side prerequisites for live mode: a technical role with that one
permission, a technical user, an API token, and a URL-type resource with "Receive data from
an external resource" enabled.

## 6. Running

- `npm run dev` — API on `:3000`, Angular dev server on `:4200` proxying `/api` and `/demo`.
- `npm start` — builds the Angular app and serves it from the API on `:3000`, single origin.

Mock mode is the default in both.

## 7. Testing

| Test | Why it matters |
| --- | --- |
| Generated payload validates against `contract/external-resources-api.schema.json`, compiled with ajv | Proves the demo emits contract-valid bodies rather than bodies the demo happens to like. The single highest-value test here |
| Mark computation: weights, `na` excluded, all-`na`, all-`no`, rounding | The one piece of arithmetic that can be silently wrong |
| Mock client rejects what the LMS rejects: bad UUID, bad status, mark 101, oversized `data`, empty `items` | Otherwise the mock teaches integrators the wrong contract |
| Threshold rule: `completed` below threshold returns `fail` | The behaviour §4.2 warns about |
| Error mapping, each code to its message | The table in §3 is testable, so it is tested |
| Session store: create, resume, finish, and the in-memory fallback when `localStorage` throws | §2.3's failure mode is easy to regress |

`node:test` for the API — no test-framework dependency. The Angular CLI default harness for
the web, over plain-TS services holding the logic worth testing.

## 8. Out of scope

- The `quiz` format. Identical flow, different item shape; the README notes the difference.
- Any database. LocalStorage is the point: the LMS holds the record of truth.
- Learner authentication. The LMS owns identity; the UUID is the only credential we get.
- Production hardening: no rate limiting, no retry/backoff, no observability.
- Anything that writes to `cbr-api2`. This repository is standalone.
