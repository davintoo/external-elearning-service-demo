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

## The flow it demonstrates

1. **Launched in an iframe** with `?session_id=<uuid>` — the only thing that crosses in the
   URL. No learner identity, nothing in the vendor's access logs or `Referer`.
2. **Learner context** fetched with `GET /api/v2/external-resources/sessions/{id}`.
3. **Sessions list** kept in LocalStorage: one row per launch this browser has seen.
4. **Start or resume** — answers are saved as they are filled in.
5. **Result sent** with `POST /api/v2/external-resources/sessions/result` as
   `format: "checklist"`.
6. **Finish screen** showing what the LMS stored, with the exact JSON sent both ways.

## Why there is a Node API

Both LMS endpoints authenticate with `x-cbr-authorization: Bearer <api-token>` and are
server-to-server by design. A token shipped to the browser is a token handed to every
learner, who could then post any mark onto any session. So the browser talks only to
`api/`, which is the sole holder of the token.

This split is not demo scaffolding — it is the shape any real integration has to take.

## Against a real LMS

Copy `api/.env.example` to `api/.env` and set both variables:

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

## Layout

```
api/       Node + Express. Holds the token, owns the contract mapping
  src/lms/   mock and live clients behind one interface
web/       Angular standalone app — the simulator in the iframe
contract/  the published JSON Schema, used by the tests
docs/      design spec and implementation plan
```
