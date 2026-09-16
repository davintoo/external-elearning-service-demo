# External e-learning service demo

A runnable reference implementation of the **external service** side of the LMS feature
*“Receive data from an external resource”*.

The LMS opens a URL-type resource in an iframe with one opaque `session_id` on the query
string. This app is what sits behind that URL: it fetches the learner's context
server-to-server, has them work through a checklist, and reports the result back so the LMS
applies it to the task exactly as it applies a SCORM result.

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000/demo/lms>.

That page is a stand-in for the LMS task page: it mints a session id and embeds the simulator
in a real iframe. No LMS, no token and no configuration are needed — the demo runs against a
built-in mock by default.

For development with live reload, in two terminals:

```bash
npm run dev --workspace=api     # :3000
npm start --workspace=web       # :4200, proxies /api and /demo
```

then open <http://localhost:4200/demo/lms>.

## Run it in Docker

```bash
docker build -t external-elearning-demo .
docker run --rm -p 3000:3000 external-elearning-demo
```

Same URL: <http://localhost:3000/demo/lms>. Mock mode is the default, so the container needs
no LMS, no token and no environment at all.

Against a real LMS, pass the two variables through:

```bash
docker run --rm -p 3000:3000 \
  -e LMS_BASE_URL=https://your-site.example.com \
  -e LMS_API_TOKEN=<api token> \
  external-elearning-demo
```

`LMS_BASE_URL` is validated at startup: an absolute `http`/`https` url or the process refuses
to start, naming the value. Leaving both variables unset is mock mode and always fine — it is
a *set but unusable* url that is fatal, because a deployment whose templating did not run
would otherwise come up in live mode and fail every LMS call at request time instead.

Or mount a config file. `/app/config` exists for this and holds nothing else, so either
form is safe:

```bash
docker run --rm -p 3000:3000 -v ./config/.env:/app/config/.env external-elearning-demo
docker run --rm -p 3000:3000 -v ./secrets:/app/config external-elearning-demo
```

> Mount secrets **only** at `/app/config` (or point `ENV_FILE` somewhere else). A mount
> replaces whatever is at its target, so a directory mounted anywhere under `/app/api`
> hides the source tree and the container exits with
> `Cannot find module '/app/api/src/index.js'`.

The build is multi-stage: the Angular toolchain exists only while compiling, and the runtime
carries the API's production dependencies, the built static app, and `contract/` — which the
mock client reads at runtime to validate payloads the way the real LMS does.

The image is about 380 MB on its default Debian-slim base. `NODE_VERSION` overrides that base
if you need a different one — an Alpine variant is smaller again, though the build stage
compiles `lmdb` and `msgpackr-extract` through `node-gyp`, so Alpine needs `python3`, `make`
and `g++` installed in the build stage before it will work.

## The flow it demonstrates

1. **Launched in an iframe** with `?session_id=<uuid>` — the only thing in the URL that
   identifies anything. No learner identity, nothing in the vendor's access logs or `Referer`.
2. **Fitted to the frame** over pym.js — the resource reports its own content height and the
   LMS page applies it, so the task page grows and shrinks with the checklist instead of
   scrolling inside a box someone had to guess the size of.
3. **Learner context** fetched with `GET /api/v2/external-resources/sessions/{id}`.
4. **Sessions list** kept in LocalStorage: one row per launch this browser has seen.
5. **Start or resume** — answers are saved as they are filled in.
6. **Result sent** with `POST /api/v2/external-resources/sessions/result` as
   `format: "checklist"`.
7. **Finish screen** showing what the LMS stored, with the exact JSON sent both ways.

## Fitting the frame

Only the host can resize an iframe, so the two have to talk. Collaborator's LMS speaks
pym.js: the child posts a message to its parent and the parent applies the height.

```
pym xPYMx <childId> xPYMx height xPYMx <pixels>
```

The LMS names the frame by putting `childId` on the launch URL; every message the resource
sends is addressed with it. `web/src/app/core/pym.ts` is that half, in about forty lines —
`@cbr/pym` is not installable from a public registry, and a reference implementation is
better off showing the protocol than hiding it behind a dependency. It is wire-compatible
either way.

Two details worth copying into a real integration:

- **Measure `body`, not `documentElement.scrollHeight`.** `scrollHeight` is floored at the
  viewport, so once the host has grown the frame the number can never come back down, and
  short screens inherit the tallest one's whitespace.
- **Report heights of things that are on screen.** Measuring before the first render gets you
  an empty `body` — padding and nothing else — and the host dutifully collapses the frame to
  it before reopening a moment later.

The host half is in `api/src/demo-lms.js`, and the interesting line is the guard:

```js
if (event.source !== frame.contentWindow) return;
```

Any document in any tab can `postMessage` to the LMS page. Without pinning the sender to the
frame it created, any of them can resize it — and identifying the exact frame is stronger
than checking the origin. The applied height is clamped as well, because a resource that is
buggy or compromised should not be able to push an absurd layout onto a page hosting it.

The mock LMS sends `childId` and nothing else. Unconfigured pym also appends `parentTitle`
and `parentUrl`, which here would hand the vendor the task name and the learner's position
in the course in a query string that lands in every access log on the way — so they are
suppressed, as `optionalparams: false` does upstream. `initialWidth` is left out for a duller
reason: a server cannot measure the frame before the browser lays it out, and a resource that
sizes itself in CSS has no use for the number. A child should ignore parameters it does not
recognise, so it keeps working against an LMS that sends all three.

## Why there is a Node API

Both LMS endpoints authenticate with `x-cbr-authorization: Bearer <api-token>` and are
server-to-server by design. A token shipped to the browser is a token handed to every
learner, who could then post any mark onto any session. So the browser talks only to
`api/`, which is the sole holder of the token.

This split is not demo scaffolding — it is the shape any real integration has to take.

## Against a real LMS

Copy `config/.env.example` to `config/.env` and set both variables:

```
LMS_BASE_URL=https://your-site.example.com
LMS_API_TOKEN=<api token>
```

On the LMS side, once:

1. a **technical role** holding exactly one permission,
   `pages.can_send_external_resource_data`;
2. a **technical user** with that role;
3. an **API token** issued for that user;
4. a **URL-type resource** with *“Receive data from an external resource”* enabled, pointing
   at this app.

The site is resolved from the request host, so send to the site's own hostname. With both
variables set the mock is bypassed entirely and the `/demo/lms` host page is switched off —
the real LMS task page is the host.

## Error branches

Every documented failure is reachable in mock mode from the host page's *Force an LMS error*
list, which appends `?force=<code>`:

| Code | Key | Meaning |
| --- | --- | --- |
| 400 | `validation_error` | The payload failed schema validation; per-field messages are shown |
| 401 | `unauthorized` | Token missing, unknown or expired |
| 403 | `forbidden` | The token's role lacks `pages.can_send_external_resource_data` |
| 404 | `not_found` | Unknown session, another site's session, or a deleted one |
| 409 | `resource_not_external` | The option was turned off on the resource |
| 410 | `session_expired` | The task deadline has passed |
| 429 | `too_many_requests` | Rate limited |

A rejected send never costs the learner their answers — they stay in LocalStorage.

## Notes for integrators

- **Send `status: "completed"`, never `passed` or `failed`.** The LMS re-evaluates a terminal
  status against the task threshold. Watch a `completed` at 75% come back as `fail` against a
  threshold of 80.
- **`na` is not a failure.** Items marked not-applicable are excluded from both sides of the
  mark fraction. Counting them as unmet would fail a learner for correctly skipping a step.
- **Per-item `score` is informational.** The session mark comes from the top-level `mark`
  field; the LMS never sums the items.
- **`session_id` is the idempotency key.** Re-sending updates the same attempt — including
  one that already finished — and every change of status or mark is logged on the LMS side.
- **LocalStorage inside a third-party iframe is partitioned** per top-level site and blocked
  in some privacy modes. The store falls back to memory and says so rather than breaking.
- **The `quiz` format** is the other half of the contract and works identically: same call,
  same statuses, `format: "quiz"` with questions and answers instead of criteria.

## Tests

```bash
npm test                        # API — node:test
npm test --workspace=web        # web — Vitest + jsdom, no browser needed
```

The most important one compiles `contract/external-resources-api.schema.json` — the schema
cbr-api2 publishes, copied here verbatim — and asserts that every payload this app generates
validates against `#/$defs/ResultRequest`.

## CI / CD

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **`test`** — both workspaces, then the web build. Each workspace is named explicitly,
  because the root `npm test` script covers only the API; relying on it would skip the web
  specs and still report success. The build is a separate gate, since the suites pass even
  when the application build is broken.
- **`image`** — builds the Dockerfile, starts the container, and asserts the demo works with
  no LMS and no token: mock mode, the built app served, and a 77% submission coming back
  `fail` against the threshold.

A push to `main` then publishes **the same image that passed that smoke test** — not a
rebuild from source — to `ghcr.io/davintoo/external-elearning-service-demo`, tagged with the
commit SHA and `latest`. Pull requests build and test but never publish, so a fork cannot
push.

> The first publish creates a **private** package. Make it public under the repository's
> *Packages* settings if client developers should be able to pull it.

## Layout

```
api/         Node + Express. Holds the token, owns the contract mapping
  src/lms/     mock and live clients behind one interface
web/         Angular standalone app — the simulator in the iframe
config/      env files only — the one directory safe to mount a secret over
contract/    the published JSON Schema, used by the tests and by the mock at runtime
docs/        design spec and implementation plan
Dockerfile   multi-stage build; runtime carries no Angular toolchain
.github/     CI: both suites, the web build, and a smoke-tested image
```
