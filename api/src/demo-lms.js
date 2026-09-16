import {randomUUID} from 'node:crypto';
import express from 'express';

import {SESSION_ID_PATTERN} from './session-id.js';

const FORCEABLE = [
    ['', 'no forced error'],
    ['400', '400 — payload rejected, per-field'],
    ['401', '401 — token unknown or expired'],
    ['403', '403 — role lacks the permission'],
    ['404', '404 — session not found'],
    ['409', '409 — option turned off'],
    ['410', '410 — task deadline passed'],
    ['429', '429 — rate limited']
];

// The name this page gives the frame it creates, echoed back in every pym message the
// resource sends. A constant rather than a per-render value: the id only has to be unique
// among the frames on one page, and minting a fresh one each render would make two loads of
// the same URL differ for no gain.
const CHILD_ID = 'cbr-external-0';

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

    // `childId` goes on the frame's URL only, never on the links back to this page. It is a
    // literal here, which is what keeps the script at the foot of this document free of any
    // query-derived value.
    //
    // Deliberately absent: `parentTitle` and `parentUrl`, which unconfigured pym also appends.
    // They would hand the vendor the task name and the learner's position in the course, in a
    // query string that lands in every access log on the way. `initialWidth` is absent for a
    // duller reason — this page cannot measure the frame before the browser lays it out, and a
    // resource that sizes itself in CSS has no use for the number.
    const iframeSrc = escapeHtml(`${query(sessionId, force)}&childId=${CHILD_ID}`);
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
  /* 720px is the fallback for a resource that never speaks pym; the script below replaces it
     with the reported height, and the transition keeps that from reading as a glitch. */
  iframe { width: 100%; height: 720px; border: 1px solid #c9ccd2; border-radius: 6px; background: #fff; transition: height .15s ease; }
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
  <iframe id="resource" src="${iframeSrc}" title="External resource"></iframe>
  <aside>
    <h2>Session</h2>
    <p><code>${escapeHtml(sessionId)}</code></p>
    <p>The only thing in the launch URL that identifies anything. Everything else the
       external service knows, it fetched server-to-server.</p>
    <h2>Frame</h2>
    <p>Sized by the resource itself, over pym.js. It posts its content height to this page;
       this page applies it. The URL also carries <code>childId=${CHILD_ID}</code>, which
       names the frame so the reply can be matched to it — and nothing else.</p>
    <h2>New attempt</h2>
    <ul><li><a href="/demo/lms">Mint a new session id</a></li></ul>
    <h2>Force an LMS error</h2>
    <ul>${options}</ul>
  </aside>
</main>
<script>
(function () {
    var CHILD_ID = '${CHILD_ID}';
    var MAX_HEIGHT = 20000;
    var frame = document.getElementById('resource');

    // pym's frame format, assembled rather than matched with a regex so the delimiter needs
    // no escaping. Only the child id this page minted is accepted, so a second embedded
    // resource could not resize this one's frame.
    var prefix = 'pym' + 'xPYMx' + CHILD_ID + 'xPYMx' + 'height' + 'xPYMx';

    window.addEventListener('message', function (event) {
        // The check that matters. Any document in any tab can postMessage to this window;
        // without pinning the sender to our own frame, any of them could resize the task
        // page. Identifying the exact frame is stronger than an origin allowlist.
        if (event.source !== frame.contentWindow) {
            return;
        }
        if (typeof event.data !== 'string' || event.data.indexOf(prefix) !== 0) {
            return;
        }

        var height = Number(event.data.slice(prefix.length));
        if (!Number.isFinite(height) || height <= 0) {
            return;
        }

        // Clamped: a buggy or compromised resource must not be able to push an absurd layout
        // onto the page hosting it.
        frame.style.height = Math.min(height, MAX_HEIGHT) + 'px';
    });
})();
</script>
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
