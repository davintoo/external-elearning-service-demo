import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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

// Not in the brief's own test list, but the plan calls out the error handler as the
// highest-risk path: it must expose an LmsError faithfully AND must never leak an
// unexpected error's internals. The tests above only exercise the LmsError branch
// (404, 410); this one exercises the "anything else" branch.
test('an unexpected error never leaks its internals to the browser', async () => {
    const secretDetail = 'lms_api_token=super-secret-token-value should never reach the client';
    const explodingClient = {
        async getSession() {
            throw new Error(secretDetail);
        },
        async saveResult() {
            throw new Error(secretDetail);
        }
    };

    await withServer(async base => {
        const res = await fetch(`${base}/api/session/${SESSION_ID}`);
        const body = await res.json();
        const rawBody = JSON.stringify(body);

        assert.equal(res.status, 500);
        assert.equal(body.error.key, 'internal_error');
        assert.equal(rawBody.includes(secretDetail), false);
        assert.equal(rawBody.includes('lms_api_token'), false);
        assert.equal(rawBody.includes('super-secret'), false);
    }, {client: explodingClient});
});

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
