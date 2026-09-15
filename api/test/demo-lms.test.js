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
