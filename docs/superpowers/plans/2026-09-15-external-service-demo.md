# External e-learning service demo — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable reference implementation of the external-service side of the cbr-api2 "Receive data from an external resource" contract — an Angular simulator launched in the LMS iframe with one opaque session UUID, backed by a Node API that holds the API token and owns the payload mapping.

**Architecture:** Two npm workspaces. `api/` is an Express service that is the only holder of the LMS API token; it exposes answer-shaped routes to our own browser app and maps them onto the LMS contract. `web/` is an Angular standalone app that reads `session_id` from its launch URL, keeps per-launch answers in LocalStorage, and never talks to the LMS directly. A mock LMS client (default) and a live one sit behind one interface, so the demo runs with zero setup and switches to a real LMS by setting two env vars.

**Tech Stack:** Node 26 + Express 5 (ESM), `node:test` for API tests, `ajv` (2020-12) for contract validation, Angular 22 (standalone + signals, Vitest + jsdom), plain CSS.

Spec: [`docs/superpowers/specs/2026-09-15-external-service-demo-design.md`](../specs/2026-09-15-external-service-demo-design.md)

## Global Constraints

- The LMS API token is read only in `api/`. It must never appear in any `web/` file, any response body, or any log line.
- Every result payload sent to the LMS must validate against `contract/external-resources-api.schema.json` → `#/$defs/ResultRequest`. That schema is copied verbatim from cbr-api2 and is never edited in this repo.
- The reported status is always `"completed"`. Never `passed` / `failed` — the LMS applies the task threshold.
- Checklist items answered `na` are excluded from both the numerator and the denominator of the mark. All-`na` yields `mark: 0`.
- Every `localStorage` access is wrapped in try/catch with an in-memory fallback. A throwing or absent `localStorage` must never break a screen.
- `api/` is ESM (`"type": "module"`). JSON files are loaded with `readFileSync` + `JSON.parse`, never with import attributes.
- Working branch is `feat/external-service-demo`. Commit after every task. Never push.
- The web app is Angular 22. Its CLI scaffolds **Vitest + jsdom** (`@angular/build:unit-test`),
  not Karma/Jasmine: `describe`/`it`/`expect` are Vitest globals, spies are `vi.spyOn`, and no
  browser binary is needed. Do not add Karma, Jasmine, or `--browsers` flags.
  (`tsconfig.spec.json` sets `"types": ["vitest/globals"]`, and the scaffolded spec uses
  `describe`/`it`/`expect` with no imports, so the globals are on. `vi` is assumed to come
  from that same set but was not separately confirmed — if it is undefined at runtime, add
  `import {vi} from 'vitest';` to the spec and note it in your report.)
- `standalone` is the default in Angular 22 and the CLI omits it. Do not write
  `standalone: true` on a component.

---

### Task 1: Workspace scaffold and API configuration

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `contract/external-resources-api.schema.json` (copy)
- Create: `api/package.json`
- Create: `api/src/config.js`
- Test: `api/test/config.test.js`

**Interfaces:**
- Produces: `loadConfig(env = process.env) -> {port: number, mode: 'mock'|'live', lmsBaseUrl: string, lmsApiToken: string, frameAncestors: string}`

- [ ] **Step 1: Create the root workspace files**

`package.json`:

```json
{
  "name": "external-elearning-service-demo",
  "private": true,
  "type": "module",
  "workspaces": ["api", "web"],
  "scripts": {
    "dev": "npm run dev --workspace=api & npm start --workspace=web",
    "start": "npm run build --workspace=web && npm start --workspace=api",
    "test": "npm test --workspace=api"
  }
}
```

`.gitignore`:

```
node_modules/
dist/
.env
*.log
.angular/
.superpowers/
```

- [ ] **Step 2: Copy the published contract into the repo**

Run:

```bash
mkdir -p contract
cp /Users/aslubsky/work/collaborator/cbr-api2/docs/api/external-resources-api.schema.json contract/
```

Verify it landed and is valid JSON:

```bash
node -e "const s=JSON.parse(require('fs').readFileSync('contract/external-resources-api.schema.json','utf8')); console.log(s.\$id, Object.keys(s.\$defs).length)"
```

Expected: `https://collaborator.pro/schemas/external-resources/v1.json 16`

- [ ] **Step 3: Create the API package**

`api/package.json`:

```json
{
  "name": "@demo/api",
  "private": true,
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "express": "^5.1.0"
  },
  "devDependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1"
  }
}
```

Run: `npm install`
Expected: installs without error, creates root `node_modules` and `package-lock.json`.

- [ ] **Step 4: Write the failing test**

`api/test/config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.js';

test('defaults to mock mode when no LMS credentials are set', () => {
    const config = loadConfig({});
    assert.equal(config.mode, 'mock');
    assert.equal(config.port, 3000);
    assert.equal(config.frameAncestors, "'self'");
});

test('stays in mock mode when only one credential is set', () => {
    assert.equal(loadConfig({LMS_BASE_URL: 'https://lms.example.com'}).mode, 'mock');
    assert.equal(loadConfig({LMS_API_TOKEN: 'tok'}).mode, 'mock');
});

test('switches to live mode when both credentials are set', () => {
    const config = loadConfig({
        LMS_BASE_URL: 'https://lms.example.com',
        LMS_API_TOKEN: 'tok'
    });
    assert.equal(config.mode, 'live');
    assert.equal(config.lmsApiToken, 'tok');
});

test('strips trailing slashes from the base url so path joins never double up', () => {
    const config = loadConfig({
        LMS_BASE_URL: 'https://lms.example.com///',
        LMS_API_TOKEN: 'tok'
    });
    assert.equal(config.lmsBaseUrl, 'https://lms.example.com');
});

test('reads port and frame ancestors from the environment', () => {
    const config = loadConfig({PORT: '8080', ALLOWED_FRAME_ANCESTORS: "'self' https://lms.example.com"});
    assert.equal(config.port, 8080);
    assert.equal(config.frameAncestors, "'self' https://lms.example.com");
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test --workspace=api`
Expected: FAIL — `Cannot find module '.../api/src/config.js'`

- [ ] **Step 6: Write the implementation**

`api/src/config.js`:

```js
const DEFAULT_PORT = 3000;

/**
 * Mode is derived, never configured: holding both a base url and a token is the only
 * thing that makes a live call possible, so a half-configured .env stays safely on the
 * mock rather than failing every request at runtime.
 */
export function loadConfig(env = process.env) {
    const lmsBaseUrl = (env.LMS_BASE_URL || '').trim().replace(/\/+$/, '');
    const lmsApiToken = (env.LMS_API_TOKEN || '').trim();

    return {
        port: Number(env.PORT) || DEFAULT_PORT,
        mode: lmsBaseUrl && lmsApiToken ? 'live' : 'mock',
        lmsBaseUrl,
        lmsApiToken,
        frameAncestors: (env.ALLOWED_FRAME_ANCESTORS || "'self'").trim()
    };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test --workspace=api`
Expected: PASS — 5 tests passing.

- [ ] **Step 8: Commit**

```bash
git add package.json .gitignore contract/ api/package.json api/src/config.js api/test/config.test.js package-lock.json
git commit -m "feat: workspace scaffold, published contract, api config"
```

---

### Task 2: Checklist content and contract payload builder

**Files:**
- Create: `api/src/checklist.js`
- Create: `api/src/payload.js`
- Test: `api/test/payload.test.js`
- Test: `api/test/contract.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `CHECKLIST: {title: string, items: Array<{id: string, group: string, text: string, weight: number}>}`
  - `computeMark(items, answers) -> number` (0–100 integer)
  - `buildResultPayload({sessionId, checklist, answers, comments}) -> ResultRequest object`
  - `buildResultPayload` throws `Error` with `.code === 'incomplete_checklist'` when any item is unanswered.

- [ ] **Step 1: Create the checklist content**

`api/src/checklist.js`:

```js
/**
 * The simulator's own content. In a real external service this comes from the vendor's
 * database; here it is a constant, because the point of the demo is the LMS contract and
 * not the authoring side. Weights differ per item so the mark is visibly weighted rather
 * than a plain count.
 */
export const CHECKLIST = {
    title: 'Pump start-up procedure',
    items: [
        {id: 'c1', group: 'Preparation', text: 'PPE checked', weight: 1},
        {id: 'c2', group: 'Preparation', text: 'Work area cordoned off', weight: 1},
        {id: 'c3', group: 'Preparation', text: 'Permit to work verified', weight: 2},
        {id: 'c4', group: 'Start-up', text: 'Suction valve opened before discharge', weight: 3},
        {id: 'c5', group: 'Start-up', text: 'Bearing temperature logged', weight: 1},
        {id: 'c6', group: 'Start-up', text: 'Vibration within limits', weight: 2},
        {id: 'c7', group: 'Shutdown', text: 'Residual pressure released', weight: 2},
        {id: 'c8', group: 'Shutdown', text: 'Area handed back and signed off', weight: 1}
    ]
};
```

- [ ] **Step 2: Write the failing tests for the payload builder**

`api/test/payload.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {computeMark, buildResultPayload} from '../src/payload.js';

const CHECKLIST = {
    title: 'Test list',
    items: [
        {id: 'a', group: 'G1', text: 'A', weight: 1},
        {id: 'b', group: 'G1', text: 'B', weight: 3},
        {id: 'c', group: 'G2', text: 'C', weight: 2}
    ]
};

const all = value => ({a: value, b: value, c: value});

test('mark is the weighted share of "yes"', () => {
    // yes(1) + yes(3) out of 1+3+2 = 4/6 -> 67
    assert.equal(computeMark(CHECKLIST.items, {a: 'yes', b: 'yes', c: 'no'}), 67);
});

test('"na" items are excluded from both sides of the fraction', () => {
    // c is na, so the denominator is 1+3, not 1+3+2. yes(3)/4 -> 75
    assert.equal(computeMark(CHECKLIST.items, {a: 'no', b: 'yes', c: 'na'}), 75);
});

test('all "na" yields 0 rather than dividing by zero', () => {
    assert.equal(computeMark(CHECKLIST.items, all('na')), 0);
});

test('all "yes" is 100 and all "no" is 0', () => {
    assert.equal(computeMark(CHECKLIST.items, all('yes')), 100);
    assert.equal(computeMark(CHECKLIST.items, all('no')), 0);
});

test('builds a contract-shaped checklist payload', () => {
    const payload = buildResultPayload({
        sessionId: 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101',
        checklist: CHECKLIST,
        answers: {a: 'yes', b: 'no', c: 'na'},
        comments: {b: '  tape missing  ', c: '   '}
    });

    assert.equal(payload.session_id, 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
    assert.equal(payload.status, 'completed');
    assert.equal(payload.mark, 25);
    assert.equal(payload.data.format, 'checklist');
    assert.equal(payload.data.title, 'Test list');
    assert.deepEqual(payload.data.items[0], {
        id: 'a', order: 1, group: 'G1', text: 'A', value: 'yes', weight: 1, score: 1
    });
    assert.deepEqual(payload.data.items[1], {
        id: 'b', order: 2, group: 'G1', text: 'B', value: 'no', weight: 3, score: 0,
        comment: 'tape missing'
    });
});

test('an "na" item carries no score and a blank comment is omitted entirely', () => {
    const payload = buildResultPayload({
        sessionId: 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101',
        checklist: CHECKLIST,
        answers: {a: 'yes', b: 'yes', c: 'na'},
        comments: {c: '   '}
    });
    const naItem = payload.data.items[2];
    assert.equal('score' in naItem, false);
    assert.equal('comment' in naItem, false);
});

test('an unanswered item is refused before anything reaches the LMS', () => {
    assert.throws(
        () => buildResultPayload({
            sessionId: 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101',
            checklist: CHECKLIST,
            answers: {a: 'yes'}
        }),
        err => err.code === 'incomplete_checklist' && /b, c/.test(err.message)
    );
});

test('an unknown answer value is refused, not silently sent', () => {
    assert.throws(
        () => buildResultPayload({
            sessionId: 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101',
            checklist: CHECKLIST,
            answers: {a: 'yes', b: 'maybe', c: 'na'}
        }),
        err => err.code === 'incomplete_checklist'
    );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --workspace=api`
Expected: FAIL — `Cannot find module '.../api/src/payload.js'`

- [ ] **Step 4: Write the payload builder**

`api/src/payload.js`:

```js
const VALUES = ['yes', 'no', 'na'];

/**
 * Weighted share of met criteria. An item marked "na" did not apply to this run, so it is
 * excluded from the denominator as well as the numerator - counting it as unmet would let
 * a correctly-skipped step fail the learner.
 */
export function computeMark(items, answers) {
    let assessed = 0;
    let met = 0;

    for (const item of items) {
        if (answers[item.id] === 'na') {
            continue;
        }
        assessed += item.weight;
        if (answers[item.id] === 'yes') {
            met += item.weight;
        }
    }

    // Nothing was assessed: report 0 rather than dividing by zero. The LMS still applies
    // its threshold to it, so the learner is not silently passed.
    return assessed === 0 ? 0 : Math.round((met * 100) / assessed);
}

function assertComplete(checklist, answers) {
    const missing = checklist.items
        .filter(item => !VALUES.includes(answers[item.id]))
        .map(item => item.id);

    if (missing.length) {
        const error = new Error(`Unanswered checklist items: ${missing.join(', ')}`);
        error.code = 'incomplete_checklist';
        throw error;
    }
}

/**
 * Maps the browser's answers onto #/$defs/ResultRequest.
 *
 * status is always "completed", never passed/failed: the LMS re-evaluates a terminal
 * status against the task threshold, and a vendor that decides pass/fail itself is
 * duplicating a rule it does not own.
 */
export function buildResultPayload({sessionId, checklist, answers, comments = {}}) {
    assertComplete(checklist, answers);

    const items = checklist.items.map((item, index) => {
        const value = answers[item.id];
        const entry = {
            id: item.id,
            order: index + 1,
            group: item.group,
            text: item.text,
            value,
            weight: item.weight
        };

        // Per-item score is informational - the contract takes the session mark from the
        // top-level field and never sums these. An "na" item scores nothing at all.
        if (value !== 'na') {
            entry.score = value === 'yes' ? item.weight : 0;
        }

        const comment = (comments[item.id] || '').trim();
        if (comment) {
            entry.comment = comment;
        }

        return entry;
    });

    return {
        session_id: sessionId,
        status: 'completed',
        mark: computeMark(checklist.items, answers),
        data: {
            format: 'checklist',
            title: checklist.title,
            items
        }
    };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace=api`
Expected: PASS — all payload tests green.

- [ ] **Step 6: Write the contract-validation test**

This is the highest-value test in the repo: it proves the payload validates against the schema cbr-api2 publishes, not merely against our own idea of it.

`api/test/contract.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {CHECKLIST} from '../src/checklist.js';
import {buildResultPayload} from '../src/payload.js';

const schemaPath = fileURLToPath(
    new URL('../../contract/external-resources-api.schema.json', import.meta.url)
);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

// strict:false — the published schema uses annotation keywords (title/description/examples)
// that ajv's strict mode rejects on sight. The validation rules themselves are unaffected.
const ajv = new Ajv2020({strict: false});
addFormats(ajv);
ajv.addSchema(schema);

const validateRequest = ajv.getSchema(`${schema.$id}#/$defs/ResultRequest`);

const SESSION_ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';
const answersOf = value => Object.fromEntries(CHECKLIST.items.map(i => [i.id, value]));

function assertValid(payload) {
    const ok = validateRequest(payload);
    assert.ok(ok, `payload rejected by the published contract: ${ajv.errorsText(validateRequest.errors)}`);
}

test('the schema entry point resolves', () => {
    assert.equal(typeof validateRequest, 'function');
});

test('a mixed-answer payload validates against the published contract', () => {
    const answers = answersOf('yes');
    answers[CHECKLIST.items[1].id] = 'no';
    answers[CHECKLIST.items[2].id] = 'na';

    assertValid(buildResultPayload({
        sessionId: SESSION_ID,
        checklist: CHECKLIST,
        answers,
        comments: {[CHECKLIST.items[1].id]: 'Tape missing on the north side'}
    }));
});

test('every uniform answer value produces a valid payload', () => {
    for (const value of ['yes', 'no', 'na']) {
        assertValid(buildResultPayload({
            sessionId: SESSION_ID,
            checklist: CHECKLIST,
            answers: answersOf(value)
        }));
    }
});

test('the contract rejects what we must never send', () => {
    const base = buildResultPayload({
        sessionId: SESSION_ID, checklist: CHECKLIST, answers: answersOf('yes')
    });

    assert.equal(validateRequest({...base, session_id: 'not-a-uuid'}), false);
    assert.equal(validateRequest({...base, mark: 101}), false);
    assert.equal(validateRequest({...base, status: 'finished'}), false);
    assert.equal(validateRequest({...base, data: {...base.data, items: []}}), false);
});

test('the serialized payload stays far inside the 1 MB contract limit', () => {
    const payload = buildResultPayload({
        sessionId: SESSION_ID, checklist: CHECKLIST, answers: answersOf('no')
    });
    assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') < 1048576);
});
```

- [ ] **Step 7: Run the contract test**

Run: `npm test --workspace=api`
Expected: PASS. If `ajv.getSchema` returns `undefined`, the `$id`-relative pointer is wrong — print `schema.$id` and confirm it is `https://collaborator.pro/schemas/external-resources/v1.json`.

- [ ] **Step 8: Commit**

```bash
git add api/src/checklist.js api/src/payload.js api/test/payload.test.js api/test/contract.test.js
git commit -m "feat: checklist content and contract-validated payload builder"
```

---

### Task 3: LMS errors and the mock client

**Files:**
- Create: `api/src/errors.js`
- Create: `api/src/session-id.js`
- Create: `api/src/lms/mock-client.js`
- Test: `api/test/mock-client.test.js`

**Interfaces:**
- Consumes: `CHECKLIST` (unused here), the contract schema.
- Produces:
  - `class LmsError extends Error { status: number; key: string; fields: object|null }`
  - `forcedError(code) -> LmsError | null`
  - `class MockLmsClient { async getSession(sessionId, opts) ; async saveResult(payload, opts) }`
  - Both client methods accept `opts = {force?: string}` and return the contract response bodies (`{data: {...}}`).

- [ ] **Step 1: Write the failing tests**

`api/test/mock-client.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {MockLmsClient} from '../src/lms/mock-client.js';
import {LmsError} from '../src/errors.js';

const SESSION_ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';

const payload = (over = {}) => ({
    session_id: SESSION_ID,
    status: 'completed',
    mark: 90,
    data: {
        format: 'checklist',
        title: 'T',
        items: [{id: 'c1', order: 1, group: 'G', text: 'Item', value: 'yes', weight: 1, score: 1}]
    },
    ...over
});

test('a session is materialised on first read and keeps its identity afterwards', async () => {
    const client = new MockLmsClient();
    const first = await client.getSession(SESSION_ID);

    assert.equal(first.data.session_id, SESSION_ID);
    assert.equal(first.data.status, 'started');
    assert.equal(first.data.mark, null);
    assert.equal(first.data.threshold, 80);
    assert.equal(first.data.attempt_number, 1);
    assert.equal(typeof first.data.user.name, 'string');

    const second = await client.getSession(SESSION_ID);
    assert.equal(second.data.started_at, first.data.started_at);
});

test('a malformed session id is a 404, exactly as an unknown one would be', async () => {
    const client = new MockLmsClient();
    await assert.rejects(() => client.getSession('B3F1C9E2-4A17-4C0E-9F31-8A2D5E77B101'), err =>
        err instanceof LmsError && err.status === 404 && err.key === 'not_found');
});

test('a mark at or above the threshold comes back finished', async () => {
    const client = new MockLmsClient();
    const res = await client.saveResult(payload({mark: 80}));

    assert.equal(res.data.status, 'finished');
    assert.equal(res.data.mark, 80);
    assert.equal(res.data.threshold, 80);
    assert.equal(res.data.task_status, 'finished');
    assert.equal(res.data.task_mark, 80);
});

test('a "completed" below the threshold comes back as fail — the behaviour the contract warns about', async () => {
    const client = new MockLmsClient();
    const res = await client.saveResult(payload({mark: 79}));

    assert.equal(res.data.status, 'fail');
    assert.equal(res.data.task_status, 'fail');
});

test('resending updates the stored session instead of creating another attempt', async () => {
    const client = new MockLmsClient();
    const first = await client.saveResult(payload({mark: 40}));
    const second = await client.saveResult(payload({mark: 95}));

    assert.equal(first.data.attempt_number, 1);
    assert.equal(second.data.attempt_number, 1);
    assert.equal(second.data.status, 'finished');
    assert.equal((await client.getSession(SESSION_ID)).data.mark, 95);
});

test('the mock refuses every payload the LMS refuses', async () => {
    const client = new MockLmsClient();
    const rejects = async over => {
        await assert.rejects(() => client.saveResult(payload(over)), err =>
            err instanceof LmsError && err.status === 400 && err.key === 'validation_error');
    };

    await rejects({session_id: 'not-a-uuid'});
    await rejects({status: 'finished'});
    await rejects({mark: 101});
    await rejects({mark: -1});
    await rejects({data: {format: 'checklist', items: []}});
    await rejects({data: {format: 'checklist', items: [{id: 'c1', text: 'x', value: 'perhaps'}]}});
    await rejects({data: {format: 'checklist', items: [{id: 'c1', value: 'yes'}]}});
});

test('a rejection names the field at fault, which is the only reason to develop against a mock', async () => {
    const client = new MockLmsClient();
    const fieldsOf = async over => {
        try {
            await client.saveResult(payload(over));
        } catch (error) {
            return error.fields;
        }
        throw new Error('expected the payload to be rejected');
    };

    // A missing required property is the case ajv reports with an empty instancePath.
    const {session_id: _drop, ...noSessionId} = payload();
    let fields;
    try {
        await client.saveResult(noSessionId);
        throw new Error('expected the payload to be rejected');
    } catch (error) {
        fields = error.fields;
    }
    assert.ok(fields.session_id, `expected a session_id message, got ${JSON.stringify(fields)}`);
    assert.equal('body' in fields, false);

    assert.ok((await fieldsOf({mark: 101})).mark);
    // A fault inside the payload is filed under its top-level field, per the contract.
    assert.ok((await fieldsOf({
        data: {format: 'checklist', items: [{id: 'c1', value: 'yes'}]}
    })).data);

    // The contract's own example carries two keys at once, so one bad field must not mask
    // the next - ajv reports only the first unless allErrors is on.
    const both = await fieldsOf({session_id: 'not-a-uuid', mark: 101});
    assert.ok(both.session_id, `expected session_id, got ${JSON.stringify(both)}`);
    assert.ok(both.mark, `expected mark, got ${JSON.stringify(both)}`);

    // An undeclared property is the other shape ajv reports with an empty instancePath.
    assert.ok((await fieldsOf({extra_junk: true})).extra_junk);

    // A malformed item must be reported as the malformed item. "must match exactly one
    // schema in oneOf" names nothing, and `data` is where integrators actually go wrong.
    const dataFields = await fieldsOf({
        data: {format: 'checklist', items: [{id: 'c1', value: 'yes'}]}
    });
    assert.match(dataFields.data, /text/, dataFields.data);
    assert.equal(/oneOf/.test(dataFields.data), false, dataFields.data);

    // The branch is selected by `format`, never guessed from the shape of ajv's output.
    // Both of these are ordinary mistakes, and both used to be answered by blaming a
    // `format` that was correct - the wrong branch's complaint about its own discriminator.
    for (const format of ['quiz', 'checklist']) {
        const emptyItems = await fieldsOf({data: {format, items: []}});
        assert.match(emptyItems.data, /items/, emptyItems.data);
        assert.equal(/format/.test(emptyItems.data), false, emptyItems.data);

        const noItems = await fieldsOf({data: {format}});
        assert.match(noItems.data, /items/, noItems.data);
        assert.equal(/format/.test(noItems.data), false, noItems.data);
    }

    // An unrecognised format is the one case where `format` really is the fault.
    const badFormat = await fieldsOf({data: {format: 'banana', items: []}});
    assert.match(badFormat.data, /format/, badFormat.data);

    // The assertions above still pass if the branch lookup is hardcoded to the wrong
    // shape, because QuizData and ChecklistData agree about `items`. This one cannot: a
    // valid ChecklistItem sent as a quiz is rejected for carrying `value`, which QuizItem
    // forbids - a complaint the checklist branch could never produce.
    const wrongShape = await fieldsOf({
        data: {format: 'quiz', items: [{id: 'q1', text: 'Which valve?', value: 'yes'}]}
    });
    assert.match(wrongShape.data, /value/, wrongShape.data);
    assert.equal(/format/.test(wrongShape.data), false, wrongShape.data);
});

test('an oversized payload is refused with the same 1 MB rule the LMS applies', async () => {
    const client = new MockLmsClient();
    const items = Array.from({length: 400}, (_, i) => ({
        id: `c${i}`, order: i + 1, text: 'x'.repeat(3000), value: 'yes', weight: 1, score: 1
    }));

    await assert.rejects(
        () => client.saveResult(payload({data: {format: 'checklist', items}})),
        err => err instanceof LmsError && err.status === 400
    );
});

test('a forced code raises exactly that error on both calls', async () => {
    const client = new MockLmsClient();

    for (const [code, key] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'],
        [409, 'resource_not_external'], [410, 'session_expired'], [429, 'too_many_requests']]) {
        await assert.rejects(() => client.getSession(SESSION_ID, {force: String(code)}), err =>
            err.status === code && err.key === key);
        await assert.rejects(() => client.saveResult(payload(), {force: String(code)}), err =>
            err.status === code && err.key === key);
    }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=api`
Expected: FAIL — `Cannot find module '.../api/src/errors.js'`

- [ ] **Step 3: Write the error type**

`api/src/errors.js`:

```js
/**
 * One error type for everything the LMS can answer with. `key` is the machine-readable key
 * from the published ErrorResponse, which is what the web app switches on to show a message
 * an integrator can act on.
 */
export class LmsError extends Error {
    constructor(status, key, message, fields = null) {
        super(message);
        this.name = 'LmsError';
        this.status = status;
        this.key = key;
        this.fields = fields;
    }

    toJSON() {
        const body = {status: this.status, key: this.key, message: this.message};
        if (this.fields) {
            body.fields = this.fields;
        }
        return body;
    }
}

const FORCEABLE = {
    400: () => new LmsError(400, 'validation_error', 'The LMS rejected the payload', {
        mark: '"mark" must be less than or equal to 100'
    }),
    401: () => new LmsError(401, 'unauthorized', 'API token is missing, unknown or expired'),
    403: () => new LmsError(403, 'forbidden', 'Permission denied'),
    404: () => new LmsError(404, 'not_found', `Session not found`),
    409: () => new LmsError(409, 'resource_not_external', 'Resource does not accept external data'),
    410: () => new LmsError(410, 'session_expired', 'Task deadline has passed'),
    429: () => new LmsError(429, 'too_many_requests', 'Too many requests')
};

/**
 * Mock-only. Lets the demo show every documented failure branch without anyone having to
 * break a real LMS to see one.
 */
export function forcedError(code) {
    const make = FORCEABLE[Number(code)];
    return make ? make() : null;
}
```

`api/src/session-id.js`:

```js
/**
 * The published SessionId pattern, verbatim: lowercase hex only, unbraced, version nibble 4
 * and an RFC-4122 variant nibble. Deliberately stricter than a general-purpose UUID check,
 * because the contract is - anything else is not an id the LMS could have minted.
 */
export const SESSION_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
```

- [ ] **Step 4: Write the mock client**

`api/src/lms/mock-client.js`:

```js
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {LmsError, forcedError} from '../errors.js';
import {SESSION_ID_PATTERN} from '../session-id.js';

const schemaPath = fileURLToPath(
    new URL('../../../contract/external-resources-api.schema.json', import.meta.url)
);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

// allErrors: ajv stops at the first failing keyword by default, which would report only
// one bad field per request. The contract's ValidationErrorResponse is "one entry per
// rejected field" and its own example carries two at once - under-reporting here would
// send an integrator round the loop once per mistake.
const ajv = new Ajv2020({strict: false, allErrors: true});
addFormats(ajv);
ajv.addSchema(schema);
const validateRequest = ajv.getSchema(`${schema.$id}#/$defs/ResultRequest`);

const MAX_DATA_BYTES = 1048576;

const THRESHOLD = 80;
const ATTEMPTS_LIMIT = 3;

const DATA_BRANCHES = {quiz: 'QuizData', checklist: 'ChecklistData'};

/**
 * Renders one ajv error the way the contract's ValidationErrorResponse examples read: the
 * offending path in quotes, then the reason. ajv's additionalProperties message never names
 * the property it objected to, so it is spliced back in.
 */
function describeError(error, pathPrefix = '') {
    const detail = error.params?.additionalProperty
        ? `${error.message} ("${error.params.additionalProperty}")`
        : error.message;
    const path = `${pathPrefix}${error.instancePath}`.slice(1).replace(/\//g, '.');

    return path ? `"${path}" ${detail}` : detail;
}

/**
 * `data` is a oneOf, and ajv reports BOTH branches' failures plus a generic "must match
 * exactly one schema in oneOf" - none of which say which branch the sender meant. Ranking
 * those raw errors to guess the intended branch is unreliable: for an empty or missing
 * `items` the wrong branch's `format` complaint outranks the right branch's real one, and
 * the sender gets blamed for a `format` that was correct.
 *
 * The schema carries its own discriminator, so use it. Validate against the branch `format`
 * names and report that branch's first error. Nothing is inferred.
 */
function describeData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return '"data" must be an object';
    }

    const branch = DATA_BRANCHES[data.format];
    if (!branch) {
        return `"data.format" must be one of: ${Object.keys(DATA_BRANCHES).join(', ')}`;
    }

    const validateBranch = ajv.getSchema(`${schema.$id}#/$defs/${branch}`);
    if (validateBranch(data)) {
        // The oneOf failed but the named branch passes - only reachable if the branches
        // stop being mutually exclusive, which their `format` consts currently prevent.
        return '"data" must match exactly one of the quiz or checklist shapes';
    }

    return describeError(validateBranch.errors[0], '/data');
}

/**
 * A stand-in for cbr-api2 that enforces what cbr-api2 enforces.
 *
 * It validates against the same published schema the LMS's Joi mirror is generated from, and
 * applies the same threshold rule, so a payload this accepts is a payload the real LMS
 * accepts. A mock that merely says yes would teach integrators the wrong contract.
 */
export class MockLmsClient {
    constructor({now = () => new Date()} = {}) {
        this.mode = 'mock';
        this.now = now;
        this.sessions = new Map();
    }

    _assertSessionId(sessionId) {
        // The LMS answers 404 for a session it cannot find, and a malformed id can never
        // match one. Answering 400 here would leak that the id was merely misspelled.
        if (!SESSION_ID_PATTERN.test(String(sessionId || ''))) {
            throw new LmsError(404, 'not_found', `Session "${sessionId}" not found`);
        }
    }

    _get(sessionId) {
        this._assertSessionId(sessionId);

        let session = this.sessions.get(sessionId);
        if (!session) {
            // The real LMS mints the session at launch; the mock has no launch to observe, so
            // the first mention of a well-formed id materialises it.
            session = {
                uuid: sessionId,
                status: 'started',
                mark: null,
                attempt_number: 1,
                started_at: this.now().toISOString(),
                updated_at: this.now().toISOString(),
                data: null
            };
            this.sessions.set(sessionId, session);
        }
        return session;
    }

    async getSession(sessionId, {force} = {}) {
        const forced = forcedError(force);
        if (forced) {
            throw forced;
        }

        const session = this._get(sessionId);

        return {
            data: {
                session_id: session.uuid,
                user: {id: 482, name: 'Ivan Petrenko', login: 'i.petrenko', lang: 'uk'},
                resource_id: 512,
                task_id: 9137,
                attempt_number: session.attempt_number,
                attempts_limit: ATTEMPTS_LIMIT,
                threshold: THRESHOLD,
                status: session.status,
                mark: session.mark,
                started_at: session.started_at,
                expires_at: null
            }
        };
    }

    async saveResult(payload, {force} = {}) {
        const forced = forcedError(force);
        if (forced) {
            throw forced;
        }

        if (!validateRequest(payload)) {
            // One entry per rejected field, keyed by the TOP-LEVEL field name. ajv reports a
            // missing required property with an empty instancePath and the name in params,
            // so keying off instancePath alone files "session_id is missing" under "body" -
            // useless to the integrator trying to fix it.
            const fields = {};
            let dataRejected = false;

            for (const error of validateRequest.errors) {
                const path = (error.instancePath || '').split('/').filter(Boolean);
                const field = path[0] ||
                    error.params?.missingProperty ||
                    error.params?.additionalProperty ||
                    'body';

                // `data` is answered by describeData, against the branch its own `format`
                // names, because the raw oneOf errors cannot say which branch was meant.
                if (field === 'data') {
                    dataRejected = true;
                    continue;
                }

                fields[field] = describeError(error);
            }

            if (dataRejected) {
                fields.data = describeData(payload.data);
            }

            throw new LmsError(400, 'validation_error', 'The LMS rejected the payload', fields);
        }

        if (payload.data &&
            Buffer.byteLength(JSON.stringify(payload.data), 'utf8') > MAX_DATA_BYTES) {
            throw new LmsError(400, 'validation_error', 'The LMS rejected the payload', {
                data: `"data" must not exceed ${MAX_DATA_BYTES} bytes when serialized`
            });
        }

        const session = this._get(payload.session_id);

        // The contract's status translation, then the threshold re-evaluation. A terminal
        // status below the threshold is turned into a fail — which is exactly the case an
        // integrator needs to see, because their "completed" does not decide the verdict.
        const incoming = {
            passed: 'finished',
            completed: 'finished',
            failed: 'fail',
            incomplete: 'inprogress',
            'not attempted': 'started'
        };
        let status = payload.status === 'browsed' ? session.status : incoming[payload.status];
        const mark = payload.mark === undefined || payload.mark === null ? session.mark : payload.mark;

        const terminal = status === 'finished' || status === 'fail';
        if (terminal && mark !== null && mark !== undefined) {
            status = mark >= THRESHOLD ? 'finished' : 'fail';
        }

        session.status = status;
        session.mark = mark === undefined ? null : mark;
        session.data = payload.data || session.data;
        session.updated_at = this.now().toISOString();

        return {
            data: {
                session_id: session.uuid,
                attempt_number: session.attempt_number,
                status: session.status,
                mark: session.mark,
                threshold: THRESHOLD,
                task_status: session.status,
                task_mark: session.mark,
                updated_at: session.updated_at
            }
        };
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace=api`
Expected: PASS — all mock-client tests green.

- [ ] **Step 6: Commit**

```bash
git add api/src/errors.js api/src/lms/mock-client.js api/test/mock-client.test.js
git commit -m "feat: LmsError and a contract-enforcing mock LMS client"
```

---

### Task 4: Live LMS client

**Files:**
- Create: `api/src/lms/live-client.js`
- Create: `api/src/lms/index.js`
- Test: `api/test/live-client.test.js`

**Interfaces:**
- Consumes: `LmsError` from `api/src/errors.js`, `loadConfig` output, `MockLmsClient`.
- Produces:
  - `class LiveLmsClient { constructor({baseUrl, token, fetchImpl}) ; async getSession(sessionId) ; async saveResult(payload) }`
  - `createLmsClient(config) -> MockLmsClient | LiveLmsClient`

- [ ] **Step 1: Write the failing tests**

`api/test/live-client.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {LiveLmsClient} from '../src/lms/live-client.js';
import {createLmsClient} from '../src/lms/index.js';
import {MockLmsClient} from '../src/lms/mock-client.js';
import {LmsError} from '../src/errors.js';

const SESSION_ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';

const respond = (status, body) => async (url, init) => {
    respond.lastUrl = url;
    respond.lastInit = init;
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (body === undefined ? '' : JSON.stringify(body))
    };
};

test('GET hits the documented path and sends the token in its own header', async () => {
    const fetchImpl = respond(200, {data: {session_id: SESSION_ID}});
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    const res = await client.getSession(SESSION_ID);

    assert.equal(respond.lastUrl,
        `https://lms.example.com/api/v2/external-resources/sessions/${SESSION_ID}`);
    assert.equal(respond.lastInit.headers['x-cbr-authorization'], 'Bearer tok');
    assert.equal(res.data.session_id, SESSION_ID);
});

test('POST sends the payload as JSON to the result endpoint', async () => {
    const fetchImpl = respond(200, {data: {status: 'finished'}});
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    await client.saveResult({session_id: SESSION_ID, status: 'completed', mark: 90});

    assert.equal(respond.lastUrl,
        'https://lms.example.com/api/v2/external-resources/sessions/result');
    assert.equal(respond.lastInit.method, 'POST');
    assert.match(respond.lastInit.headers['content-type'], /application\/json/);
    assert.equal(JSON.parse(respond.lastInit.body).mark, 90);
});

test('a 400 keeps the per-field messages the LMS returned', async () => {
    const fetchImpl = respond(400, {data: {mark: '"mark" must be less than or equal to 100'}});
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    await assert.rejects(() => client.saveResult({}), err =>
        err instanceof LmsError &&
        err.status === 400 &&
        err.key === 'validation_error' &&
        err.fields.mark.includes('100'));
});

test('a keyed error response becomes that key and message', async () => {
    const fetchImpl = respond(410, {session_expired: 'Task deadline has passed'});
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    await assert.rejects(() => client.getSession(SESSION_ID), err =>
        err.status === 410 && err.key === 'session_expired' &&
        err.message === 'Task deadline has passed');
});

test('an empty or unparseable error body still produces a usable error', async () => {
    const fetchImpl = respond(502, undefined);
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    await assert.rejects(() => client.getSession(SESSION_ID), err =>
        err.status === 502 && err.key === 'lms_error');
});

test('a transport failure is reported as unreachable, never as a learner error', async () => {
    const fetchImpl = async () => {
        throw new TypeError('fetch failed');
    };
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    await assert.rejects(() => client.getSession(SESSION_ID), err =>
        err instanceof LmsError && err.status === 502 && err.key === 'lms_unreachable');
});

test('the factory picks the client from the resolved mode', () => {
    assert.ok(createLmsClient({mode: 'mock'}) instanceof MockLmsClient);
    assert.ok(createLmsClient({
        mode: 'live', lmsBaseUrl: 'https://lms.example.com', lmsApiToken: 'tok'
    }) instanceof LiveLmsClient);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=api`
Expected: FAIL — `Cannot find module '.../api/src/lms/live-client.js'`

- [ ] **Step 3: Write the live client**

`api/src/lms/live-client.js`:

```js
import {LmsError} from '../errors.js';

function toLmsError(status, body) {
    // 400 is the only shape with per-field detail: {data: {field: message}}.
    if (status === 400) {
        return new LmsError(400, 'validation_error', 'The LMS rejected the payload',
            body && body.data ? body.data : {});
    }

    // Everything else is a single {key: message} pair.
    const key = body && typeof body === 'object' ? Object.keys(body)[0] : null;
    return new LmsError(status, key || 'lms_error',
        key ? String(body[key]) : `LMS returned HTTP ${status}`);
}

export class LiveLmsClient {
    constructor({baseUrl, token, fetchImpl = fetch}) {
        this.mode = 'live';
        this.baseUrl = baseUrl;
        this.token = token;
        this.fetchImpl = fetchImpl;
    }

    async _call(path, init = {}) {
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                ...init,
                headers: {
                    // The API token goes in its own header, never in Authorization, and never
                    // anywhere the browser can see it.
                    'x-cbr-authorization': `Bearer ${this.token}`,
                    'content-type': 'application/json; charset=utf-8',
                    ...(init.headers || {})
                }
            });
        } catch (cause) {
            // DNS, TLS, refused connection. The learner's answers are still in their browser,
            // so this must read as "we could not reach the LMS", not as a rejected result.
            throw new LmsError(502, 'lms_unreachable',
                `Could not reach the LMS at ${this.baseUrl}: ${cause.message}`);
        }

        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }

        if (!response.ok) {
            throw toLmsError(response.status, body);
        }

        return body;
    }

    getSession(sessionId) {
        return this._call(
            `/api/v2/external-resources/sessions/${encodeURIComponent(sessionId)}`
        );
    }

    saveResult(payload) {
        return this._call('/api/v2/external-resources/sessions/result', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }
}
```

`api/src/lms/index.js`:

```js
import {MockLmsClient} from './mock-client.js';
import {LiveLmsClient} from './live-client.js';

export function createLmsClient(config) {
    if (config.mode === 'live') {
        return new LiveLmsClient({baseUrl: config.lmsBaseUrl, token: config.lmsApiToken});
    }
    return new MockLmsClient();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lms/live-client.js api/src/lms/index.js api/test/live-client.test.js
git commit -m "feat: live LMS client with contract error mapping"
```

---

### Task 5: Express app and routes

**Files:**
- Create: `api/src/app.js`
- Create: `api/src/index.js`
- Create: `api/.env.example`
- Test: `api/test/app.test.js`

**Interfaces:**
- Consumes: `loadConfig`, `createLmsClient`, `CHECKLIST`, `buildResultPayload`, `LmsError`.
- Produces: `createApp({config, client}) -> express app` exposing `GET /api/config`, `GET /api/checklist`, `GET /api/session/:sessionId`, `POST /api/session/:sessionId/result`.

- [ ] **Step 1: Write the failing tests**

`api/test/app.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {createApp} from '../src/app.js';
import {MockLmsClient} from '../src/lms/mock-client.js';
import {CHECKLIST} from '../src/checklist.js';

const SESSION_ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';

const CONFIG = {
    port: 0, mode: 'mock', lmsBaseUrl: '', lmsApiToken: '', frameAncestors: "'self'"
};

async function withServer(run, {config = CONFIG, client = new MockLmsClient()} = {}) {
    const server = createApp({config, client}).listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        await run(base);
    } finally {
        server.close();
    }
}

const allAnswers = value => Object.fromEntries(CHECKLIST.items.map(i => [i.id, value]));

test('GET /api/config reports the mode and never the token', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/api/config`);
        const body = await res.json();

        assert.equal(res.status, 200);
        // Asserted in LIVE mode deliberately: the point is that a configured token is
        // never echoed, and in mock mode there is no token to leak in the first place.
        assert.equal(body.mode, 'live');
        // Case-insensitive, and checks the secret's VALUE too. A leak would most likely
        // surface under the config's own field name, `lmsApiToken`, whose capital T a
        // lowercase substring search misses entirely.
        const serialized = JSON.stringify(body);
        assert.equal(serialized.toLowerCase().includes('token'), false, serialized);
        assert.equal(serialized.includes('super-secret'), false, serialized);
    }, {config: {...CONFIG, mode: 'live', lmsApiToken: 'super-secret'}});
});

test('GET /api/checklist returns the criteria the UI renders', async () => {
    await withServer(async base => {
        const body = await (await fetch(`${base}/api/checklist`)).json();

        assert.equal(body.title, CHECKLIST.title);
        assert.equal(body.items.length, CHECKLIST.items.length);
        assert.equal(body.items[0].id, CHECKLIST.items[0].id);
    });
});

test('GET /api/session/:id returns the launch context', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/api/session/${SESSION_ID}`);
        const body = await res.json();

        assert.equal(res.status, 200);
        assert.equal(body.data.session_id, SESSION_ID);
        assert.equal(body.data.threshold, 80);
    });
});

test('an unknown session is a 404 carrying the contract key', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/api/session/nonsense`);
        const body = await res.json();

        assert.equal(res.status, 404);
        assert.equal(body.error.key, 'not_found');
    });
});

test('POST result returns both the payload sent and the LMS answer', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/api/session/${SESSION_ID}/result`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({answers: allAnswers('yes'), comments: {}})
        });
        const body = await res.json();

        assert.equal(res.status, 200);
        assert.equal(body.sent.session_id, SESSION_ID);
        assert.equal(body.sent.status, 'completed');
        assert.equal(body.sent.mark, 100);
        assert.equal(body.received.data.status, 'finished');
    });
});

test('an all-"no" run is sent as completed and comes back failed', async () => {
    await withServer(async base => {
        const body = await (await fetch(`${base}/api/session/${SESSION_ID}/result`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({answers: allAnswers('no')})
        })).json();

        assert.equal(body.sent.status, 'completed');
        assert.equal(body.sent.mark, 0);
        assert.equal(body.received.data.status, 'fail');
    });
});

test('an incomplete checklist is refused locally, before the LMS is called', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/api/session/${SESSION_ID}/result`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({answers: {[CHECKLIST.items[0].id]: 'yes'}})
        });
        const body = await res.json();

        assert.equal(res.status, 400);
        assert.equal(body.error.key, 'incomplete_checklist');
    });
});

test('a forced code is surfaced with its status and key', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/api/session/${SESSION_ID}?force=410`);
        const body = await res.json();

        assert.equal(res.status, 410);
        assert.equal(body.error.key, 'session_expired');
    });
});

test('the force switch is ignored in live mode, so it can never reach a real LMS', async () => {
    // The same MockLmsClient as every other test - only the mode differs, which is the
    // point: this asserts the GATE, not the mock. Delete the `config.mode === 'mock'`
    // check in app.js and this comes back 410 instead of the session.
    await withServer(async base => {
        const res = await fetch(`${base}/api/session/${SESSION_ID}?force=410`);
        const body = await res.json();

        assert.equal(res.status, 200);
        assert.equal(body.data.session_id, SESSION_ID);
    }, {config: {...CONFIG, mode: 'live', lmsBaseUrl: 'https://lms.example.com', lmsApiToken: 'tok'}});
});

test('responses carry a frame-ancestors policy so the LMS can embed us', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/api/config`);

        assert.equal(res.headers.get('content-security-policy'), "frame-ancestors 'self'");
        assert.equal(res.headers.get('x-frame-options'), null);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=api`
Expected: FAIL — `Cannot find module '.../api/src/app.js'`

- [ ] **Step 3: Write the app**

`api/src/app.js`:

```js
import express from 'express';

import {CHECKLIST} from './checklist.js';
import {buildResultPayload} from './payload.js';
import {LmsError} from './errors.js';

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

export function createApp({config, client}) {
    const app = express();

    app.use(express.json({limit: '2mb'}));

    // We are meant to be embedded. X-Frame-Options has no origin list and would block the
    // LMS outright, so the policy is expressed only as frame-ancestors.
    app.use((req, res, next) => {
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', `frame-ancestors ${config.frameAncestors}`);
        next();
    });

    // Mock-only escape hatch for demonstrating each documented failure branch. The live
    // client ignores it, so it can never alter what a real LMS is asked to do.
    const opts = req => ({force: config.mode === 'mock' ? req.query.force : undefined});

    app.get('/api/config', (req, res) => {
        // Deliberately only the mode. Nothing about the token, not even its presence.
        res.json({mode: config.mode});
    });

    app.get('/api/checklist', (req, res) => {
        res.json(CHECKLIST);
    });

    app.get('/api/session/:sessionId', asyncRoute(async (req, res) => {
        res.json(await client.getSession(req.params.sessionId, opts(req)));
    }));

    app.post('/api/session/:sessionId/result', asyncRoute(async (req, res) => {
        const {answers = {}, comments = {}} = req.body || {};

        let payload;
        try {
            payload = buildResultPayload({
                sessionId: req.params.sessionId,
                checklist: CHECKLIST,
                answers,
                comments
            });
        } catch (error) {
            if (error.code !== 'incomplete_checklist') {
                throw error;
            }
            // Caught here rather than sent: an incomplete run is our own content rule, not
            // something the LMS should be asked to reject.
            return res.status(400).json({
                error: {status: 400, key: 'incomplete_checklist', message: error.message}
            });
        }

        const received = await client.saveResult(payload, opts(req));

        // Both directions, verbatim. Reading the exact bytes their own answers produced is
        // what an integrator came here for.
        res.json({sent: payload, received});
    }));

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        if (error instanceof LmsError) {
            return res.status(error.status).json({error: error.toJSON()});
        }

        console.error(error);
        res.status(500).json({
            error: {status: 500, key: 'internal_error', message: 'Unexpected demo server error'}
        });
    });

    return app;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=api`
Expected: PASS.

- [ ] **Step 5: Write the entry point and env example**

`api/src/index.js`:

```js
import {loadConfig} from './config.js';
import {createLmsClient} from './lms/index.js';
import {createApp} from './app.js';

try {
    // Node loads .env natively; its absence is the normal case for the mock demo.
    process.loadEnvFile();
} catch {
    // no .env file — mock mode
}

const config = loadConfig();
const app = createApp({config, client: createLmsClient(config)});

app.listen(config.port, () => {
    console.log(`demo api listening on http://localhost:${config.port} [${config.mode} mode]`);
    if (config.mode === 'mock') {
        console.log('no LMS configured — set LMS_BASE_URL and LMS_API_TOKEN for live mode');
    }
});
```

`api/.env.example`:

```
# Leave both unset to run against the built-in mock LMS (the default).
# Set BOTH to talk to a real cbr-api2 instance.
#
# The LMS side needs, once:
#   1. a technical role holding only pages.can_send_external_resource_data
#   2. a technical user with that role
#   3. an API token issued for that user
#   4. a URL-type resource with "Receive data from an external resource" enabled
#
# LMS_BASE_URL=https://your-site.example.com
# LMS_API_TOKEN=

PORT=3000
ALLOWED_FRAME_ANCESTORS='self'
```

- [ ] **Step 6: Verify the server boots**

Run: `npm start --workspace=api` (then Ctrl-C)
Expected: `demo api listening on http://localhost:3000 [mock mode]`

- [ ] **Step 7: Commit**

```bash
git add api/src/app.js api/src/index.js api/.env.example api/test/app.test.js
git commit -m "feat: express app, routes and frame-ancestors policy"
```

---

### Task 6: Mock LMS host page

**Files:**
- Create: `api/src/demo-lms.js`
- Modify: `api/src/app.js` (mount the router)
- Test: `api/test/demo-lms.test.js`

**Interfaces:**
- Consumes: `config.mode`.
- Produces: `demoLmsRouter(config) -> express.Router` mounted at `/demo`, serving `GET /demo/lms`.

- [ ] **Step 1: Write the failing tests**

`api/test/demo-lms.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {createApp} from '../src/app.js';
import {MockLmsClient} from '../src/lms/mock-client.js';

const CONFIG = {
    port: 0, mode: 'mock', lmsBaseUrl: '', lmsApiToken: '', frameAncestors: "'self'"
};

async function withServer(run, config = CONFIG) {
    const server = createApp({config, client: new MockLmsClient()}).listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        server.close();
    }
}

const UUID_V4 = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;

test('a bare visit is redirected to a freshly minted session id', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/demo/lms`, {redirect: 'manual'});

        assert.equal(res.status, 302);
        assert.match(res.headers.get('location'), UUID_V4);
    });
});

test('the minted session id survives a reload, so resume is demonstrable', async () => {
    await withServer(async base => {
        const location = (await fetch(`${base}/demo/lms`, {redirect: 'manual'}))
            .headers.get('location');

        const first = await (await fetch(`${base}${location}`)).text();
        const second = await (await fetch(`${base}${location}`)).text();
        const sessionId = location.match(UUID_V4)[0];

        assert.ok(first.includes(sessionId));
        assert.equal(first, second);
    });
});

test('the page embeds the simulator in a same-origin iframe carrying the session id', async () => {
    await withServer(async base => {
        const location = (await fetch(`${base}/demo/lms`, {redirect: 'manual'}))
            .headers.get('location');
        const sessionId = location.match(UUID_V4)[0];
        const html = await (await fetch(`${base}${location}`)).text();

        assert.match(html, new RegExp(`<iframe[^>]+src="/\\?session_id=${sessionId}"`));
    });
});

test('a forced code is passed through to the embedded app', async () => {
    await withServer(async base => {
        const id = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';
        const html = await (await fetch(`${base}/demo/lms?session_id=${id}&force=410`)).text();

        assert.match(html, new RegExp(`src="/\\?session_id=${id}&amp;force=410"`));
    });
});

test('a malformed session id is replaced rather than embedded', async () => {
    await withServer(async base => {
        const res = await fetch(`${base}/demo/lms?session_id=nonsense`, {redirect: 'manual'});

        assert.equal(res.status, 302);
        assert.match(res.headers.get('location'), UUID_V4);
    });
});

test('a hostile force value cannot break out of the iframe src', async () => {
    await withServer(async base => {
        const id = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';
        const hostile = '"><script>alert(1)</script>';
        const html = await (await fetch(
            `${base}/demo/lms?session_id=${id}&force=${encodeURIComponent(hostile)}`
        )).text();

        // This page renders query-derived values straight into markup, which is a real
        // injection surface even in a demo. `session_id` is pattern-checked, but `force`
        // is arbitrary text and reaches both an attribute and a link.
        assert.equal(html.includes('<script>alert(1)</script>'), false, html);
        assert.equal(html.includes('"><script'), false, html);
    });
});

test('an injected query separator cannot add parameters to the launch url', async () => {
    await withServer(async base => {
        const id = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';
        const hostile = '410&session_id=evil';
        const html = await (await fetch(
            `${base}/demo/lms?session_id=${id}&force=${encodeURIComponent(hostile)}`
        )).text();

        // HTML-escaping alone would leave "&amp;", which the browser decodes back into a
        // live separator. The value has to be URL-encoded before it joins the query string.
        assert.match(html, /force=410%26session_id%3Devil/, html);
        assert.equal(html.includes('&amp;session_id=evil'), false, html);
    });
});

test('the host page is not served in live mode', async () => {
    await withServer(async base => {
        assert.equal((await fetch(`${base}/demo/lms`)).status, 404);
    }, {...CONFIG, mode: 'live'});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=api`
Expected: FAIL — `Cannot find module '.../api/src/demo-lms.js'`

- [ ] **Step 3: Write the host page**

`api/src/demo-lms.js`:

```js
import {randomUUID} from 'node:crypto';
import express from 'express';

import {SESSION_ID_PATTERN} from './session-id.js';

const FORCEABLE = [
    ['', 'no forced error'],
    ['401', '401 — token unknown or expired'],
    ['403', '403 — role lacks the permission'],
    ['404', '404 — session not found'],
    ['409', '409 — option turned off'],
    ['410', '410 — task deadline passed'],
    ['429', '429 — rate limited']
];

// Escapes `'` as well as `"`, so the helper stays correct if an attribute is ever written
// single-quoted. Leaving it out makes "every attribute here is double-quoted" an unwritten
// invariant that a later edit can silently break.
const escapeHtml = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderPage({sessionId, force}) {
    // Two different escapes, applied in the right order and for different reasons.
    // encodeURIComponent stops a value adding or terminating query syntax; escapeHtml stops
    // the finished URL breaking out of the attribute. HTML-escaping alone is not enough:
    // it turns an injected "&" into "&amp;", which the browser decodes straight back into a
    // live query separator, letting an attacker append parameters to the launch URL.
    const query = (id, code) => `/?session_id=${encodeURIComponent(id)}` +
        (code ? `&force=${encodeURIComponent(code)}` : '');

    const iframeSrc = escapeHtml(query(sessionId, force));
    const options = FORCEABLE.map(([code, label]) => {
        const href = escapeHtml(`/demo/lms${query(sessionId, code).slice(1)}`);
        const current = (force || '') === code ? ' aria-current="true"' : '';
        return `<li><a href="${href}"${current}>${escapeHtml(label)}</a></li>`;
    }).join('');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock LMS — external resource task</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: #f4f5f7; color: #16181d; }
  header { background: #16181d; color: #fff; padding: 12px 20px; }
  header strong { font-weight: 600; }
  main { padding: 20px; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) 260px; }
  iframe { width: 100%; height: 720px; border: 1px solid #c9ccd2; border-radius: 6px; background: #fff; }
  aside { background: #fff; border: 1px solid #c9ccd2; border-radius: 6px; padding: 14px; }
  aside h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 8px; }
  ul { list-style: none; margin: 0 0 16px; padding: 0; }
  li { margin: 4px 0; }
  a[aria-current] { font-weight: 700; }
  code { background: #eceef1; padding: 1px 4px; border-radius: 3px; word-break: break-all; }
  @media (max-width: 860px) { main { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>
<body>
<header><strong>Mock LMS</strong> — task “Pump start-up procedure”</header>
<main>
  <iframe src="${iframeSrc}" title="External resource"></iframe>
  <aside>
    <h2>Session</h2>
    <p><code>${escapeHtml(sessionId)}</code></p>
    <p>This is the only thing the LMS puts in the launch URL. Everything else the external
       service knows, it fetched server-to-server.</p>
    <h2>New attempt</h2>
    <ul><li><a href="/demo/lms">Mint a new session id</a></li></ul>
    <h2>Force an LMS error</h2>
    <ul>${options}</ul>
  </aside>
</main>
</body>
</html>`;
}

/**
 * Stands in for the LMS task page so step one of the flow - being embedded in someone
 * else's document - is a real iframe rather than a description of one. Mock mode only:
 * against a live LMS the real task page is the host.
 */
export function demoLmsRouter(config) {
    const router = express.Router();

    router.get('/lms', (req, res) => {
        if (config.mode !== 'mock') {
            return res.status(404).type('text').send('The mock LMS host page is mock mode only');
        }

        const {session_id: sessionId, force} = req.query;

        // Minting on redirect rather than on render keeps the id in the address bar, so a
        // reload returns to the same session and "resume" is demonstrable at all.
        if (!SESSION_ID_PATTERN.test(String(sessionId || ''))) {
            const params = new URLSearchParams(req.query);
            params.set('session_id', randomUUID());
            return res.redirect(`/demo/lms?${params.toString()}`);
        }

        res.type('html').send(renderPage({sessionId, force: force ? String(force) : ''}));
    });

    return router;
}
```

- [ ] **Step 4: Mount the router**

In `api/src/app.js`, add the import next to the others:

```js
import {demoLmsRouter} from './demo-lms.js';
```

and mount it immediately after the `app.get('/api/config', ...)` block:

```js
    app.use('/demo', demoLmsRouter(config));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace=api`
Expected: PASS — all demo-lms tests green, earlier tests unaffected.

- [ ] **Step 6: Commit**

```bash
git add api/src/demo-lms.js api/src/app.js api/test/demo-lms.test.js
git commit -m "feat: mock LMS host page embedding the simulator in a real iframe"
```

---

### Task 7: Angular scaffold and the no-session screen

**Files:**
- Create: `web/` (Angular CLI scaffold)
- Create: `web/proxy.conf.json`
- Create: `web/src/app/core/types.ts`
- Create: `web/src/app/core/launch.ts`
- Modify: `web/src/app/app.ts`, `web/src/app/app.html`, `web/src/styles.css`
- Test: `web/src/app/core/launch.spec.ts`

**Interfaces:**
- Consumes: nothing from the API tasks at runtime yet.
- Produces:
  - `readLaunch(search: string) -> {sessionId: string | null, force: string | null}`
  - The TypeScript mirrors of the contract in `core/types.ts` used by every later web task.

- [ ] **Step 1: Scaffold the Angular app**

Run from the repo root:

```bash
npx --yes @angular/cli@22 new web \
  --directory=web --style=css --routing=false --ssr=false \
  --skip-git --skip-install --package-manager=npm
```

Expected: `web/` created with `src/app/app.ts`, `app.html`, `app.css`, `app.config.ts`,
`tsconfig.spec.json`, and `angular.json` carrying `"test": {"builder": "@angular/build:unit-test"}`.
Its devDependencies are `vitest` and `jsdom` — there is no Karma, no Jasmine, and no browser
binary to install. Angular 22 lists Node 26 in its own `engines`, so the scaffold runs here.

Then install everything from the root so the workspace links up:

```bash
npm install
```

- [ ] **Step 2: Point the dev server at the API**

`web/proxy.conf.json`:

```json
{
  "/api": {"target": "http://localhost:3000", "secure": false},
  "/demo": {"target": "http://localhost:3000", "secure": false}
}
```

Proxying `/demo` as well is what keeps the host page and the embedded app on one origin in
dev, so the iframe behaves exactly as it does in the built single-port mode.

In `web/angular.json`, under `projects.web.architect.serve.options`, add:

```json
"proxyConfig": "proxy.conf.json"
```

- [ ] **Step 3: Write the failing test**

`web/src/app/core/launch.spec.ts`:

```ts
import {readLaunch} from './launch';

describe('readLaunch', () => {
  it('reads the session id the LMS appended to the launch url', () => {
    const launch = readLaunch('?session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
    expect(launch.sessionId).toBe('b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
    expect(launch.force).toBeNull();
  });

  it('keeps whatever query string the administrator already configured', () => {
    const launch = readLaunch('?lang=uk&session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
    expect(launch.sessionId).toBe('b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
  });

  it('reports no session when launched outside the LMS', () => {
    expect(readLaunch('').sessionId).toBeNull();
    expect(readLaunch('?lang=uk').sessionId).toBeNull();
  });

  it('rejects a malformed session id instead of sending it to the LMS', () => {
    expect(readLaunch('?session_id=nonsense').sessionId).toBeNull();
    expect(readLaunch('?session_id=B3F1C9E2-4A17-4C0E-9F31-8A2D5E77B101').sessionId).toBeNull();
  });

  it('carries the mock force parameter through', () => {
    const launch = readLaunch('?session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101&force=410');
    expect(launch.force).toBe('410');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test --workspace=web`
Expected: FAIL — cannot resolve `./launch`.

If the run enters watch mode instead of exiting, append the builder's non-watch flag
(`-- --watch=false`) and record the working invocation in your report so later tasks and the
README use the same one.

- [ ] **Step 5: Write the contract types**

`web/src/app/core/types.ts`:

```ts
export type ChecklistValue = 'yes' | 'no' | 'na';

export interface ChecklistItem {
  id: string;
  group: string;
  text: string;
  weight: number;
}

export interface Checklist {
  title: string;
  items: ChecklistItem[];
}

/** #/$defs/SessionContextResponse */
export interface SessionContext {
  session_id: string;
  user: {id: number; name: string; login: string; lang: string};
  resource_id: number;
  task_id: number;
  attempt_number: number;
  attempts_limit: number | null;
  threshold: number;
  status: string;
  mark: number | null;
  started_at: string;
  expires_at: string | null;
}

/** #/$defs/ResultResponse */
export interface ResultResponse {
  data: {
    session_id: string;
    attempt_number: number;
    status: string;
    mark: number | null;
    threshold: number;
    task_status: string;
    task_mark: number | null;
    updated_at: string;
  };
}

/** What POST /api/session/:id/result answers with: both directions, verbatim. */
export interface SubmitResponse {
  sent: unknown;
  received: ResultResponse;
}

export interface ApiError {
  status: number;
  key: string;
  message: string;
  fields?: Record<string, string>;
}

export interface StoredSession {
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  status: 'in-progress' | 'finished';
  answers: Record<string, ChecklistValue>;
  comments: Record<string, string>;
  lastResult: ResultResponse | null;
}
```

- [ ] **Step 6: Write the launch parser**

`web/src/app/core/launch.ts`:

```ts
/**
 * The published SessionId pattern, verbatim: lowercase hex, unbraced, version nibble 4.
 * Anything else is not a session id the LMS could have minted, so it is treated as no
 * session at all rather than passed on for the LMS to reject.
 */
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface Launch {
  sessionId: string | null;
  force: string | null;
}

export function readLaunch(search: string): Launch {
  const params = new URLSearchParams(search);
  const sessionId = params.get('session_id') ?? '';

  return {
    sessionId: SESSION_ID_PATTERN.test(sessionId) ? sessionId : null,
    force: params.get('force')
  };
}
```

- [ ] **Step 7: Write the root component with the no-session screen**

`web/src/app/app.ts`:

```ts
import {Component, signal} from '@angular/core';
import {readLaunch} from './core/launch';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly launch = signal(readLaunch(window.location.search));
}
```

`web/src/app/app.html`:

```html
@if (!launch().sessionId) {
  <section class="card notice">
    <h1>Launch this from the LMS</h1>
    <p>
      This page is an external learning resource. The LMS opens it in an iframe with a
      <code>session_id</code> on the URL — that UUID is the only thing it hands over, and
      without it there is no learner to report a result for.
    </p>
    <p><a href="/demo/lms">Open the mock LMS task page</a></p>
  </section>
} @else {
  <p class="card">Session {{ launch().sessionId }}</p>
}
```

`web/src/app/app.css`:

```css
:host { display: block; }
```

`web/src/styles.css` (replace the file):

```css
:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --surface: #ffffff;
  --border: #c9ccd2;
  --text: #16181d;
  --muted: #5b616e;
  --accent: #1a5fb4;
  --yes: #1a7f37;
  --no: #b42318;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 16px;
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

h1 { font-size: 18px; margin: 0 0 8px; }
h2 { font-size: 15px; margin: 0 0 8px; }

code {
  background: #eceef1;
  padding: 1px 4px;
  border-radius: 3px;
  word-break: break-all;
}

button {
  font: inherit;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  cursor: pointer;
}

button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button:disabled { opacity: .5; cursor: not-allowed; }

.muted { color: var(--muted); }
```

`web/src/app/app.spec.ts` (replaces the scaffold's placeholder of the same name):

```ts
import {TestBed} from '@angular/core/testing';
import {App} from './app';

describe('App', () => {
  it('explains itself when opened outside an LMS', async () => {
    // jsdom gives an empty query string, which IS the no-session case: someone always
    // opens the URL directly, and this screen is what they get. Asserts only that branch
    // deliberately - later tasks replace the placeholder that follows it, and a test
    // pinned to the placeholder would have to be rewritten three times.
    await TestBed.configureTestingModule({imports: [App]}).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Launch this from the LMS');
    expect(text).toContain('session_id');
  });
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test --workspace=web`
Expected: PASS — the 5 `readLaunch` specs. Delete the default `app.spec.ts` if the scaffold's
placeholder title assertion fails; it tests nothing we keep.

- [ ] **Step 9: Verify the iframe end to end**

Run in two terminals: `npm run dev --workspace=api`, then `npm start --workspace=web`.
Open `http://localhost:4200/demo/lms`.
Expected: the mock LMS page renders with the simulator embedded in the iframe, showing
`Session <uuid>`. Opening `http://localhost:4200/` directly shows the "Launch this from the
LMS" screen.

- [ ] **Step 10: Commit**

```bash
git add web/ package-lock.json
git commit -m "feat: angular scaffold, launch parsing and the no-session screen"
```

---

### Task 8: Session store with a LocalStorage fallback

**Files:**
- Create: `web/src/test-setup.ts`
- Modify: `web/angular.json` (test target `setupFiles`)
- Create: `web/src/app/core/session-store.ts`
- Test: `web/src/app/core/session-store.spec.ts`

**Test environment first.** Node 26 defines its own `globalThis.localStorage`, inert without
`--localstorage-file`, and Vitest's jsdom environment will not overwrite a global it did not
create. So specs see Node's non-functional getter, not a working `Storage` — and
`window.localStorage` is no escape, because `window === globalThis` there. A `NODE_OPTIONS`
prefix in the npm script fixes it on POSIX and breaks it on Windows `cmd.exe`, which this
repo's readers will be using. Redefine the global in a setup file instead: no dependency, no
shell syntax, same behaviour everywhere.

`web/src/test-setup.ts`:

```ts
/**
 * The spec spies on `Storage.prototype.setItem`, so the object installed here must call
 * through that prototype - otherwise the spy never intercepts and the fallback test
 * silently tests nothing.
 */
class MemoryStorage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

// `Storage` is redefined too, so `vi.spyOn(Storage.prototype, 'setItem')` patches the very
// prototype the instance below dispatches through.
for (const [name, value] of [['Storage', MemoryStorage], ['localStorage', new MemoryStorage()]] as const) {
  Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
}

/**
 * Every spec starts from an empty store with unpatched prototypes.
 *
 * Without this, isolation rests on each spec remembering to clear the key it wrote, and a
 * spec that forgets - or writes a second key - leaks state into its neighbours silently.
 * Restoring here rather than at the end of a test body also survives a failing assertion,
 * which would otherwise leave a throwing `setItem` installed for whatever runs next.
 */
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
```

Wire it in `web/angular.json` under `projects.web.architect.test`:

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": {"setupFiles": ["src/test-setup.ts"]}
}
```

`web/package.json`'s `test` script stays the plain scaffolded `ng test`.

Add the setup file to `web/tsconfig.spec.json`'s `include` as well — it is part of the test
compilation, and without it every run prints `File 'src/test-setup.ts' not found in
TypeScript compilation`. A warning on every run of a reference repo teaches its readers that
warnings are normal:

```json
"include": ["src/**/*.d.ts", "src/**/*.spec.ts", "src/test-setup.ts"]
```

And keep it **out** of `web/tsconfig.app.json`, which compiles the application. The setup file
references `afterEach` and `vi`, so if the app build sees it, `ng build` and `ng serve` fail
with `Cannot find name 'afterEach'`. Tests still pass, which is exactly why this is easy to
miss: run `npm run build --workspace=web` after touching tsconfig, not just the suite.

**Interfaces:**
- Consumes: `StoredSession`, `ChecklistValue`, `ResultResponse` from `core/types.ts`.
- Produces: `SessionStore` (`providedIn: 'root'`) with
  `sessions: Signal<StoredSession[]>`, `persistent: Signal<boolean>`,
  `get(sessionId)`, `start(sessionId)`, `saveProgress(sessionId, answers, comments)`,
  `finish(sessionId, result)`, `reopen(sessionId)`.

- [ ] **Step 1: Write the failing tests**

`web/src/app/core/session-store.spec.ts`:

```ts
import {TestBed} from '@angular/core/testing';
import {SessionStore, SESSIONS_KEY} from './session-store';
import {ResultResponse} from './types';

const ID = 'b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101';
const OTHER = '0f5a1d44-9c7b-4a2e-8d10-5b6c3f2e9a77';

const result: ResultResponse = {
  data: {
    session_id: ID, attempt_number: 1, status: 'finished', mark: 87,
    threshold: 80, task_status: 'finished', task_mark: 87,
    updated_at: '2026-09-15T10:22:31Z'
  }
};

const make = () => TestBed.configureTestingModule({}).inject(SessionStore);

describe('SessionStore', () => {
  beforeEach(() => {
    localStorage.removeItem(SESSIONS_KEY);
    TestBed.resetTestingModule();
  });

  it('starts empty and records a launch', () => {
    const store = make();
    expect(store.sessions().length).toBe(0);

    const session = store.start(ID);
    expect(session.sessionId).toBe(ID);
    expect(session.status).toBe('in-progress');
    expect(store.sessions().length).toBe(1);
  });

  it('is idempotent on a relaunch of the same session', () => {
    const store = make();
    const first = store.start(ID);
    const second = store.start(ID);

    expect(store.sessions().length).toBe(1);
    expect(second.startedAt).toBe(first.startedAt);
  });

  it('survives a reload, which is what makes resume possible', () => {
    const store = make();
    store.start(ID);
    store.saveProgress(ID, {c1: 'yes'}, {c1: 'looked fine'});

    TestBed.resetTestingModule();
    const reloaded = make();

    expect(reloaded.get(ID)!.answers['c1']).toBe('yes');
    expect(reloaded.get(ID)!.comments['c1']).toBe('looked fine');
  });

  it('keeps sessions apart', () => {
    const store = make();
    store.start(ID);
    store.start(OTHER);
    store.saveProgress(ID, {c1: 'yes'}, {});

    expect(store.get(OTHER)!.answers).toEqual({});
    expect(store.sessions().length).toBe(2);
  });

  it('marks a session finished and keeps the LMS answer with it', () => {
    const store = make();
    store.start(ID);
    store.finish(ID, result);

    expect(store.get(ID)!.status).toBe('finished');
    expect(store.get(ID)!.lastResult!.data.mark).toBe(87);
  });

  it('reopens a finished session for a resend without losing the answers', () => {
    const store = make();
    store.start(ID);
    store.saveProgress(ID, {c1: 'no'}, {});
    store.finish(ID, result);
    store.reopen(ID);

    expect(store.get(ID)!.status).toBe('in-progress');
    expect(store.get(ID)!.answers['c1']).toBe('no');
  });

  it('reports no session it has never seen', () => {
    expect(make().get(OTHER)).toBeNull();
  });

  it('ignores corrupted storage rather than failing to start', () => {
    localStorage.setItem(SESSIONS_KEY, '{not json');
    expect(make().sessions()).toEqual([]);

    TestBed.resetTestingModule();
    localStorage.setItem(SESSIONS_KEY, '{"not":"an array"}');
    expect(make().sessions()).toEqual([]);
  });

  it('falls back to memory when storage throws, and says so', () => {
    // Construct FIRST, while storage still works, so probeStorage() reports true. Spying
    // before construction makes the probe fail instead, and then `persistent` is already
    // false before a single write - which is how this test used to pass with the line it
    // guards deleted.
    const store = make();
    expect(store.persistent()).toBe(true);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    store.start(ID);
    store.saveProgress(ID, {c1: 'yes'}, {});

    // Flipped BY the failed write, not by the constructor probe.
    expect(store.persistent()).toBe(false);
    expect(store.get(ID)!.answers['c1']).toBe('yes');

    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=web`
Expected: FAIL — cannot resolve `./session-store`.

- [ ] **Step 3: Write the store**

`web/src/app/core/session-store.ts`:

```ts
import {Injectable, signal} from '@angular/core';
import {ChecklistValue, ResultResponse, StoredSession} from './types';

export const SESSIONS_KEY = 'demo.sessions';

/**
 * The demo's only persistence. A real external service has a database; this one deliberately
 * does not, which keeps the LMS contract the single integration surface.
 *
 * Every access is guarded: inside a third-party iframe LocalStorage is partitioned per
 * top-level site and blocked outright in some privacy modes, so an unguarded read would take
 * the whole simulator down in a way that looks like an integration bug.
 */
@Injectable({providedIn: 'root'})
export class SessionStore {
  private readonly state = signal<StoredSession[]>(readAll());

  readonly sessions = this.state.asReadonly();
  readonly persistent = signal(probeStorage());

  get(sessionId: string): StoredSession | null {
    return this.state().find(session => session.sessionId === sessionId) ?? null;
  }

  start(sessionId: string): StoredSession {
    const existing = this.get(sessionId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const session: StoredSession = {
      sessionId,
      startedAt: now,
      updatedAt: now,
      status: 'in-progress',
      answers: {},
      comments: {},
      lastResult: null
    };

    this.write([...this.state(), session]);
    return session;
  }

  saveProgress(
    sessionId: string,
    answers: Record<string, ChecklistValue>,
    comments: Record<string, string>
  ): void {
    this.update(sessionId, session => ({...session, answers, comments}));
  }

  finish(sessionId: string, lastResult: ResultResponse): void {
    this.update(sessionId, session => ({...session, status: 'finished', lastResult}));
  }

  /**
   * Back to editable without clearing anything. The contract makes session_id the
   * idempotency key and explicitly allows revising a finished session, so a resend is a
   * documented move rather than a way around the rules.
   */
  reopen(sessionId: string): void {
    this.update(sessionId, session => ({...session, status: 'in-progress'}));
  }

  private update(sessionId: string, change: (session: StoredSession) => StoredSession): void {
    this.write(this.state().map(session =>
      session.sessionId === sessionId
        ? {...change(session), updatedAt: new Date().toISOString()}
        : session
    ));
  }

  private write(sessions: StoredSession[]): void {
    // The signal IS the in-memory fallback: it already holds the value before storage is
    // attempted, so a failed write costs persistence, never the session in front of you.
    this.state.set(sessions);

    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
      // Partitioned, full, or disabled. The signal already holds the value, so the session
      // keeps working for as long as the tab is open.
      this.persistent.set(false);
    }
  }
}

function readAll(): StoredSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Anything but an array is someone else's data or a truncated write — start clean
    // rather than crash on the first .find().
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function probeStorage(): boolean {
  try {
    const key = `${SESSIONS_KEY}.probe`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=web`
Expected: PASS — all 9 `SessionStore` specs.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/core/session-store.ts web/src/app/core/session-store.spec.ts
git commit -m "feat: session store with an in-memory LocalStorage fallback"
```

---

### Task 9: API client, context card and sessions list

**Files:**
- Create: `web/src/app/core/api.ts`
- Create: `web/src/app/ui/context-card.ts`
- Create: `web/src/app/ui/sessions-list.ts`
- Modify: `web/src/app/app.config.ts` (provide HttpClient)
- Modify: `web/src/app/app.ts`, `web/src/app/app.html`

**Interfaces:**
- Consumes: `SessionStore`, `readLaunch`, `core/types.ts`.
- Produces:
  - `DemoApi` with `config()`, `checklist()`, `session(sessionId, force)`, `submit(sessionId, answers, comments, force)` — all returning promises.
  - `<app-context-card [context]="…">`
  - `<app-sessions-list [sessions]="…" [currentId]="…" [persistent]="…" [actionLabel]="…" (open)="…">`
  - `App` exposes `screen: Signal<'no-session'|'loading'|'error'|'list'|'checklist'|'finish'>`.

- [ ] **Step 1: Provide HttpClient**

`web/src/app/app.config.ts` — add to the imports and to `providers`:

```ts
import {provideHttpClient} from '@angular/common/http';
```

```ts
    provideHttpClient(),
```

- [ ] **Step 2: Write the API client**

`web/src/app/core/api.ts`:

```ts
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {Injectable, inject} from '@angular/core';
import {firstValueFrom} from 'rxjs';

import {ApiError, Checklist, ChecklistValue, SessionContext, SubmitResponse} from './types';

/**
 * The browser's only counterpart. It never sees the LMS: the API token lives in the demo
 * server, so every LMS call is made there and this speaks in answers, not payloads.
 */
@Injectable({providedIn: 'root'})
export class DemoApi {
  private readonly http = inject(HttpClient);

  config(): Promise<{mode: 'mock' | 'live'}> {
    return this.call(this.http.get<{mode: 'mock' | 'live'}>('/api/config'));
  }

  checklist(): Promise<Checklist> {
    return this.call(this.http.get<Checklist>('/api/checklist'));
  }

  session(sessionId: string, force: string | null): Promise<SessionContext> {
    return this.call(
      this.http.get<{data: SessionContext}>(`/api/session/${sessionId}${query(force)}`)
    ).then(response => response.data);
  }

  submit(
    sessionId: string,
    answers: Record<string, ChecklistValue>,
    comments: Record<string, string>,
    force: string | null
  ): Promise<SubmitResponse> {
    return this.call(this.http.post<SubmitResponse>(
      `/api/session/${sessionId}/result${query(force)}`,
      {answers, comments}
    ));
  }

  private async call<T>(request: import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}

const query = (force: string | null) => (force ? `?force=${encodeURIComponent(force)}` : '');

function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.error && error.error.error) {
      return error.error.error as ApiError;
    }
    // status 0 is the browser refusing to tell us why — offline, blocked, CORS.
    return {
      status: error.status,
      key: error.status === 0 ? 'demo_unreachable' : 'internal_error',
      message: error.message
    };
  }

  return {status: 0, key: 'internal_error', message: String(error)};
}
```

- [ ] **Step 3: Write the context card**

`web/src/app/ui/context-card.ts`:

```ts
import {Component, input} from '@angular/core';
import {SessionContext} from '../core/types';

@Component({
  selector: 'app-context-card',
  template: `
    <section class="card">
      <h2>{{ context().user.name }}</h2>
      <p class="muted">
        {{ context().user.login }} · {{ context().user.lang }} ·
        attempt {{ context().attempt_number }}@if (context().attempts_limit) { of {{ context().attempts_limit }} }
        · pass mark {{ context().threshold }}%
        @if (context().expires_at) { · due {{ context().expires_at }} }
      </p>
      <p class="muted">
        Fetched server-to-server from the LMS. The launch URL carried nothing but
        <code>{{ context().session_id }}</code>.
      </p>
    </section>
  `
})
export class ContextCard {
  readonly context = input.required<SessionContext>();
}
```

- [ ] **Step 4: Write the sessions list**

`web/src/app/ui/sessions-list.ts`:

```ts
import {Component, input, output} from '@angular/core';
import {StoredSession} from '../core/types';

@Component({
  selector: 'app-sessions-list',
  template: `
    <section class="card">
      <h2>Sessions on this browser</h2>
      <p class="muted">
        Kept in LocalStorage. The LMS mints one session per attempt; this list is only what
        this browser has been launched with.
      </p>

      @if (!persistent()) {
        <p class="warn">
          Storage is unavailable here, so this history will not survive a reload. The current
          session still works.
        </p>
      }

      @if (sessions().length === 0) {
        <p class="muted">Nothing yet.</p>
      } @else {
        <table>
          <tbody>
            @for (session of sessions(); track session.sessionId) {
              <tr [class.current]="session.sessionId === currentId()">
                <td><code>{{ session.sessionId.slice(0, 8) }}</code></td>
                <td>{{ session.status }}</td>
                <td>
                  @if (session.lastResult) {
                    LMS: {{ session.lastResult.data.status }}
                    @if (session.lastResult.data.mark !== null) { · {{ session.lastResult.data.mark }}% }
                  } @else {
                    <span class="muted">not sent</span>
                  }
                </td>
                <td>{{ session.updatedAt }}</td>
                <td>
                  @if (session.sessionId === currentId()) { <strong>current</strong> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      <p>
        <button class="primary" (click)="open.emit()">{{ actionLabel() }}</button>
      </p>
    </section>
  `,
  styles: [`
    table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
    td { padding: 5px 8px; border-top: 1px solid var(--border); vertical-align: top; }
    tr.current td { background: #eef4fc; }
    .warn { color: var(--no); }
  `]
})
export class SessionsList {
  readonly sessions = input.required<StoredSession[]>();
  readonly currentId = input.required<string>();
  readonly persistent = input.required<boolean>();
  readonly actionLabel = input.required<string>();
  readonly open = output<void>();
}
```

- [ ] **Step 5: Wire the root component**

`web/src/app/app.ts`:

```ts
import {Component, computed, inject, signal} from '@angular/core';

import {DemoApi} from './core/api';
import {SessionStore} from './core/session-store';
import {readLaunch} from './core/launch';
import {ApiError, Checklist, SessionContext} from './core/types';
import {ContextCard} from './ui/context-card';
import {SessionsList} from './ui/sessions-list';

type Screen = 'no-session' | 'loading' | 'error' | 'list' | 'checklist' | 'finish';

@Component({
  selector: 'app-root',
  imports: [ContextCard, SessionsList],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly api = inject(DemoApi);
  protected readonly store = inject(SessionStore);

  protected readonly launch = signal(readLaunch(window.location.search));
  protected readonly mode = signal<'mock' | 'live'>('mock');
  protected readonly context = signal<SessionContext | null>(null);
  protected readonly checklist = signal<Checklist | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly screen = signal<Screen>('no-session');

  protected readonly current = computed(() => {
    const sessionId = this.launch().sessionId;
    return sessionId ? this.store.sessions().find(s => s.sessionId === sessionId) ?? null : null;
  });

  /** Resume only makes sense for a launch this browser has already worked on. */
  protected readonly actionLabel = computed(() => {
    const session = this.current();
    if (!session) {
      return 'Start';
    }
    return session.status === 'finished' ? 'Send again' : 'Resume';
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const {sessionId, force} = this.launch();
    if (!sessionId) {
      this.screen.set('no-session');
      return;
    }

    this.screen.set('loading');
    try {
      const [config, checklist, context] = await Promise.all([
        this.api.config(),
        this.api.checklist(),
        this.api.session(sessionId, force)
      ]);

      this.mode.set(config.mode);
      this.checklist.set(checklist);
      this.context.set(context);
      this.screen.set('list');
    } catch (error) {
      this.error.set(error as ApiError);
      this.screen.set('error');
    }
  }

  protected openChecklist(): void {
    const sessionId = this.launch().sessionId!;
    const session = this.store.get(sessionId);

    if (!session) {
      this.store.start(sessionId);
    } else if (session.status === 'finished') {
      this.store.reopen(sessionId);
    }

    this.screen.set('checklist');
  }
}
```

`web/src/app/app.html`:

```html
@switch (screen()) {
  @case ('no-session') {
    <section class="card notice">
      <h1>Launch this from the LMS</h1>
      <p>
        This page is an external learning resource. The LMS opens it in an iframe with a
        <code>session_id</code> on the URL — that UUID is the only thing it hands over, and
        without it there is no learner to report a result for.
      </p>
      <p><a href="/demo/lms">Open the mock LMS task page</a></p>
    </section>
  }

  @case ('loading') {
    <p class="card">Loading the session…</p>
  }

  @case ('error') {
    <section class="card">
      <h1>The LMS could not be reached</h1>
      <p><code>{{ error()!.key }}</code> — {{ error()!.message }}</p>
    </section>
  }

  @default {
    @if (mode() === 'mock') {
      <p class="card muted">Mock mode — no LMS is configured, results are not stored anywhere.</p>
    }

    <app-context-card [context]="context()!" />

    @if (screen() === 'list') {
      <app-sessions-list
        [sessions]="store.sessions()"
        [currentId]="launch().sessionId!"
        [persistent]="store.persistent()"
        [actionLabel]="actionLabel()"
        (open)="openChecklist()" />
    }
  }
}
```

- [ ] **Step 6: Verify in the browser**

Run `npm run dev --workspace=api` and `npm start --workspace=web`, open
`http://localhost:4200/demo/lms`.
Expected: the learner card shows "Ivan Petrenko · i.petrenko · uk · attempt 1 of 3 · pass
mark 80%", the sessions list is empty with a **Start** button. Reload → still empty (nothing
started). Open `http://localhost:4200/demo/lms?session_id=<same id>&force=410` → the error
screen shows `session_expired`.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/core/api.ts web/src/app/ui/ web/src/app/app.ts web/src/app/app.html web/src/app/app.config.ts
git commit -m "feat: api client, learner context card and sessions list"
```

---

### Task 10: Checklist screen and submission

**Files:**
- Create: `web/src/app/ui/checklist-form.ts`
- Modify: `web/src/app/app.ts`, `web/src/app/app.html`

**Interfaces:**
- Consumes: `Checklist`, `ChecklistValue`, `StoredSession`, `DemoApi`, `SessionStore`.
- Produces: `<app-checklist-form [checklist] [session] (changed) (finish)>`; `App.submit()` setting `submission: Signal<SubmitResponse | null>`.

- [ ] **Step 1: Write the checklist form**

`web/src/app/ui/checklist-form.ts`:

```ts
import {Component, OnInit, computed, input, output, signal} from '@angular/core';
import {Checklist, ChecklistValue, StoredSession} from '../core/types';

interface Group {
  name: string;
  items: Checklist['items'];
}

@Component({
  selector: 'app-checklist-form',
  template: `
    <section class="card">
      <h2>{{ checklist().title }}</h2>
      <p class="muted">
        Every criterion needs an answer. “n/a” is excluded from the mark entirely, rather
        than counted as unmet.
      </p>

      @for (group of groups(); track group.name) {
        <h3>{{ group.name }}</h3>
        @for (item of group.items; track item.id) {
          <div class="item">
            <div class="text">{{ item.text }} <span class="muted">· weight {{ item.weight }}</span></div>
            <div class="values">
              @for (value of VALUES; track value) {
                <label [class.on]="answers()[item.id] === value">
                  <input type="radio" [name]="item.id" [value]="value"
                         [checked]="answers()[item.id] === value"
                         (change)="setAnswer(item.id, value)">
                  {{ value }}
                </label>
              }
            </div>
            <input class="comment" type="text" placeholder="comment (optional)"
                   [value]="comments()[item.id] || ''"
                   (input)="setComment(item.id, $any($event.target).value)">
          </div>
        }
      }

      <p class="summary">
        {{ answeredCount() }} of {{ checklist().items.length }} answered ·
        mark so far <strong>{{ previewMark() }}%</strong>
      </p>

      <button class="primary" [disabled]="!complete() || busy()" (click)="finish.emit()">
        {{ busy() ? 'Sending…' : 'Finish and send to the LMS' }}
      </button>
    </section>
  `,
  styles: [`
    h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
         margin: 16px 0 6px; }
    .item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px;
            padding: 8px 0; border-top: 1px solid var(--border); }
    .values { display: flex; gap: 6px; }
    label { border: 1px solid var(--border); border-radius: 4px; padding: 3px 9px; cursor: pointer; }
    label.on { border-color: var(--accent); background: #eef4fc; font-weight: 600; }
    label input { position: absolute; opacity: 0; width: 0; height: 0; }
    .comment { grid-column: 1 / -1; padding: 5px 7px; border: 1px solid var(--border);
               border-radius: 4px; font: inherit; }
    .summary { margin: 14px 0 10px; }
  `]
})
export class ChecklistForm implements OnInit {
  readonly checklist = input.required<Checklist>();
  readonly session = input.required<StoredSession>();
  readonly busy = input.required<boolean>();

  readonly changed = output<{
    answers: Record<string, ChecklistValue>;
    comments: Record<string, string>;
  }>();
  readonly finish = output<void>();

  protected readonly VALUES: ChecklistValue[] = ['yes', 'no', 'na'];

  protected readonly answers = signal<Record<string, ChecklistValue>>({});
  protected readonly comments = signal<Record<string, string>>({});

  protected readonly groups = computed<Group[]>(() => {
    const groups: Group[] = [];
    for (const item of this.checklist().items) {
      // First-appearance order, the same way the LMS report renders them.
      let group = groups.find(candidate => candidate.name === item.group);
      if (!group) {
        group = {name: item.group, items: []};
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  });

  protected readonly answeredCount = computed(() =>
    this.checklist().items.filter(item => this.answers()[item.id]).length);

  protected readonly complete = computed(() =>
    this.answeredCount() === this.checklist().items.length);

  /**
   * The same rule the server applies, shown live. Duplicated deliberately and only for the
   * preview — the mark that is actually sent is always the server's.
   */
  protected readonly previewMark = computed(() => {
    let assessed = 0;
    let met = 0;
    for (const item of this.checklist().items) {
      const value = this.answers()[item.id];
      if (!value || value === 'na') {
        continue;
      }
      assessed += item.weight;
      if (value === 'yes') {
        met += item.weight;
      }
    }
    return assessed === 0 ? 0 : Math.round((met * 100) / assessed);
  });

  /**
   * Seeded once from the stored session, not bound to it: the form owns the answers while it
   * is open and reports changes upward, so a save round-trip cannot reset a field the
   * learner is still typing in. A required input is only readable from ngOnInit onward.
   */
  ngOnInit(): void {
    this.answers.set({...this.session().answers});
    this.comments.set({...this.session().comments});
  }

  protected setAnswer(id: string, value: ChecklistValue): void {
    this.answers.update(current => ({...current, [id]: value}));
    this.emit();
  }

  protected setComment(id: string, value: string): void {
    this.comments.update(current => ({...current, [id]: value}));
    this.emit();
  }

  private emit(): void {
    this.changed.emit({answers: this.answers(), comments: this.comments()});
  }
}
```

- [ ] **Step 2: Add submission to the root component**

In `web/src/app/app.ts`, extend the imports:

```ts
import {ChecklistForm} from './ui/checklist-form';
import {ApiError, Checklist, ChecklistValue, SessionContext, SubmitResponse} from './core/types';
```

add `ChecklistForm` to the component's `imports` array, and add these members:

```ts
  protected readonly submission = signal<SubmitResponse | null>(null);
  protected readonly busy = signal(false);
  protected readonly submitError = signal<ApiError | null>(null);

  protected saveProgress(change: {
    answers: Record<string, ChecklistValue>;
    comments: Record<string, string>;
  }): void {
    this.store.saveProgress(this.launch().sessionId!, change.answers, change.comments);
  }

  protected async submit(): Promise<void> {
    const {sessionId, force} = this.launch();
    const session = this.store.get(sessionId!)!;

    this.busy.set(true);
    this.submitError.set(null);
    try {
      const response = await this.api.submit(
        sessionId!, session.answers, session.comments, force
      );
      this.submission.set(response);
      this.store.finish(sessionId!, response.received);
      this.screen.set('finish');
    } catch (error) {
      // The answers stay in the store either way — a rejected send must never cost the
      // learner their work.
      this.submitError.set(error as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
```

- [ ] **Step 3: Render the checklist screen**

In `web/src/app/app.html`, inside the `@default` block, after the `@if (screen() === 'list')`
block, add:

```html
    @if (screen() === 'checklist') {
      @if (submitError(); as failure) {
        <section class="card failure">
          <h2>The LMS did not accept the result</h2>
          <p><code>{{ failure.key }}</code> — {{ failure.message }}</p>
          @if (failure.fields) {
            <ul>
              @for (field of failure.fields | keyvalue; track field.key) {
                <li><code>{{ field.key }}</code>: {{ field.value }}</li>
              }
            </ul>
          }
          <p class="muted">Your answers are still here. Nothing was lost.</p>
        </section>
      }

      <app-checklist-form
        [checklist]="checklist()!"
        [session]="current()!"
        [busy]="busy()"
        (changed)="saveProgress($event)"
        (finish)="submit()" />
    }
```

Add `KeyValuePipe` to the component imports in `app.ts`:

```ts
import {KeyValuePipe} from '@angular/common';
```

and include `KeyValuePipe` in the `imports` array.

Add to `web/src/styles.css`:

```css
.failure { border-color: var(--no); }
```

- [ ] **Step 4: Verify the flow**

Run both servers, open `http://localhost:4200/demo/lms`, press **Start**.
Expected: the checklist renders in three groups; the live mark updates as answers change;
**Finish** is disabled until all eight items are answered. Answer everything `yes`, press
Finish → no error appears and the app moves past the checklist (the finish screen is Task 11,
so a blank area here is expected).

Reload mid-checklist without finishing → the sessions list shows the session as
`in-progress`, and **Resume** restores the answers.

Force a rejection: open `http://localhost:4200/demo/lms?session_id=<same id>&force=409`,
press Resume, then Finish.
Expected: the red card shows `resource_not_external` and the answers remain filled in.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/ui/checklist-form.ts web/src/app/app.ts web/src/app/app.html web/src/styles.css
git commit -m "feat: checklist screen, live mark preview and submission"
```

---

### Task 11: Finish screen

**Files:**
- Create: `web/src/app/ui/finish-screen.ts`
- Modify: `web/src/app/app.ts`, `web/src/app/app.html`

**Interfaces:**
- Consumes: `SubmitResponse`.
- Produces: `<app-finish-screen [submission]="…" (again)="…">`.

- [ ] **Step 1: Write the finish screen**

`web/src/app/ui/finish-screen.ts`:

```ts
import {Component, computed, input, output} from '@angular/core';
import {SubmitResponse} from '../core/types';

@Component({
  selector: 'app-finish-screen',
  template: `
    <section class="card">
      <h1>Result sent</h1>

      <dl>
        <dt>Session status</dt><dd><strong>{{ result().status }}</strong></dd>
        <dt>Mark</dt><dd>{{ result().mark }}%</dd>
        <dt>Pass mark</dt><dd>{{ result().threshold }}%</dd>
        <dt>Task status</dt><dd>{{ result().task_status }}</dd>
        <dt>Task mark</dt><dd>{{ result().task_mark }}%</dd>
        <dt>Stored at</dt><dd>{{ result().updated_at }}</dd>
      </dl>

      @if (verdictChanged()) {
        <p class="note">
          We reported <code>completed</code>; the LMS stored
          <code>{{ result().status }}</code>. The task threshold decides the verdict, not the
          external service — which is why the service should never send
          <code>passed</code> or <code>failed</code> itself.
        </p>
      }

      <details>
        <summary>What we sent</summary>
        <pre>{{ sentJson() }}</pre>
      </details>
      <details>
        <summary>What the LMS answered</summary>
        <pre>{{ receivedJson() }}</pre>
      </details>

      <p><button (click)="again.emit()">Revise and send again</button></p>
      <p class="muted">
        The session id is the idempotency key, so a second send updates this same attempt.
        The LMS logs every change of status or mark.
      </p>
    </section>
  `,
  styles: [`
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 14px; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .note { border-left: 3px solid var(--accent); padding-left: 10px; }
    details { margin: 8px 0; }
    summary { cursor: pointer; }
    pre { background: #16181d; color: #e6e8eb; padding: 12px; border-radius: 5px;
          overflow-x: auto; font-size: 12px; }
  `]
})
export class FinishScreen {
  readonly submission = input.required<SubmitResponse>();
  readonly again = output<void>();

  protected readonly result = computed(() => this.submission().received.data);

  /** The whole point of §4.2, made visible. */
  protected readonly verdictChanged = computed(() => this.result().status === 'fail');

  protected readonly sentJson = computed(() => JSON.stringify(this.submission().sent, null, 2));
  protected readonly receivedJson = computed(() =>
    JSON.stringify(this.submission().received, null, 2));
}
```

- [ ] **Step 2: Render it**

In `web/src/app/app.ts` add the import and list `FinishScreen` in `imports`:

```ts
import {FinishScreen} from './ui/finish-screen';
```

and add the handler:

```ts
  protected reviseAndResend(): void {
    this.store.reopen(this.launch().sessionId!);
    this.submission.set(null);
    this.screen.set('checklist');
  }
```

In `web/src/app/app.html`, inside the `@default` block, add:

```html
    @if (screen() === 'finish') {
      <app-finish-screen [submission]="submission()!" (again)="reviseAndResend()" />
    }
```

- [ ] **Step 3: Verify both verdicts**

Run both servers, open `http://localhost:4200/demo/lms`, Start, answer everything `yes`,
Finish.
Expected: `finished`, `100%`, threshold `80%`, and both JSON panels showing the exact
payload and answer.

Press **Revise and send again**, change enough answers to drop below 80 (e.g. set the
weight-3 item to `no`), Finish again.
Expected: status `fail`, and the blue note explaining that the LMS decided the verdict. The
sessions list still shows a single session — the attempt number stays `1`.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/ui/finish-screen.ts web/src/app/app.ts web/src/app/app.html
git commit -m "feat: finish screen with the raw payload both ways"
```

---

### Task 12: Single-port build, README and full verification

**Files:**
- Modify: `api/src/app.js` (serve the built web app)
- Modify: `api/src/index.js` (pass the dist path)
- Create: `README.md`
- Test: `api/test/app.test.js` (one added case)

**Interfaces:**
- Consumes: everything above.
- Produces: `createApp({config, client, webDist})` — `webDist` optional; when set, static files and an SPA fallback are served from it.

- [ ] **Step 1: Write the failing test**

Add to `api/test/app.test.js`:

```js
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('serves the built web app and falls back to index.html for the launch url', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'demo-web-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>simulator</title>');

    const server = createApp({config: CONFIG, client: new MockLmsClient(), webDist: dist})
        .listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        const root = await fetch(`${base}/?session_id=${SESSION_ID}`);
        assert.equal(root.status, 200);
        assert.match(await root.text(), /simulator/);

        // The API must keep answering JSON, not the SPA shell.
        const missing = await fetch(`${base}/api/session/nonsense`);
        assert.equal(missing.status, 404);
        assert.equal((await missing.json()).error.key, 'not_found');
    } finally {
        server.close();
    }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace=api`
Expected: FAIL — the root request 404s, because nothing serves static files yet.

- [ ] **Step 3: Serve the built app**

In `api/src/app.js`, change the signature and add the static handling at the very end, before
the error handler:

```js
export function createApp({config, client, webDist = null}) {
```

```js
    // Built single-port mode: the API also serves the compiled Angular app, so the host page
    // and the simulator share one origin and 'self' is a sufficient frame-ancestors policy.
    if (webDist) {
        app.use(express.static(webDist));
        app.get(/^\/(?!api\/|demo\/).*/, (req, res) => {
            res.sendFile('index.html', {root: webDist});
        });
    }
```

In `api/src/index.js`:

```js
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
```

```js
const distPath = fileURLToPath(new URL('../../web/dist/web/browser', import.meta.url));
const webDist = existsSync(distPath) ? distPath : null;

const app = createApp({config, client: createLmsClient(config), webDist});
```

and extend the listen log:

```js
    console.log(webDist
        ? `serving the built simulator from ${webDist}`
        : 'no build found — run `npm run build --workspace=web` or use the dev server on :4200');
```

If the Angular scaffold emits to a different path, correct `distPath` to match
`web/angular.json` → `projects.web.architect.build.options.outputPath` plus `/browser`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=api`
Expected: PASS — every API test, including the new one.

- [ ] **Step 5: Write the README**

`README.md`:

````markdown
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
````

- [ ] **Step 6: Full verification from a clean state**

```bash
rm -rf node_modules web/dist
npm install
npm test
npm test --workspace=web
npm start
```

Open <http://localhost:3000/demo/lms> and walk the whole flow:

1. The host page renders with the simulator embedded and a session id shown.
2. Press **Start**, answer all eight criteria `yes`, press **Finish**.
3. The finish screen shows `finished`, `100%`, threshold `80%`, and both JSON panels.
4. Press **Revise and send again**, set the weight-3 criterion to `no`, Finish.
   → status `fail`, with the note explaining the LMS decided the verdict.
5. Press the host page's **Mint a new session id** → the sessions list shows two rows, the
   new one `in-progress` and the old one `finished`.
6. Choose **410 — task deadline passed** from the force list → the error screen shows
   `session_expired`.
7. Open <http://localhost:3000/> directly → the "Launch this from the LMS" screen.

Every step must behave as described before the task is complete.

- [ ] **Step 7: Commit**

```bash
git add README.md api/src/app.js api/src/index.js api/test/app.test.js
git commit -m "feat: single-port build, README and end-to-end verification"
```

---

## Self-review notes

Spec coverage checked section by section: §1 architecture → Tasks 1, 5, 12; §1.1 routes →
Task 5; §1.2 server-side payload → Task 2; §1.3 mock/live → Tasks 3, 4; §2.1 launch → Task 7;
§2.2 context → Task 9; §2.3 store and fallback → Task 8; §2.4 create/resume/resend → Tasks 9,
10, 11; §2.5 submit, mark rule, `completed` → Tasks 2, 10; §2.6 finish screen → Task 11; §3
errors → Tasks 3, 4, 5, 10; §4 embedding → Tasks 5, 6; §5 configuration → Tasks 1, 5; §6
running → Tasks 7, 12; §7 testing → every task; §8 out of scope → nothing built.
