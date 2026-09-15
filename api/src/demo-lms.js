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

const escapeHtml = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function renderPage({sessionId, force}) {
    const iframeSrc = escapeHtml(`/?session_id=${sessionId}${force ? `&force=${force}` : ''}`);
    const options = FORCEABLE.map(([code, label]) => {
        const href = escapeHtml(`/demo/lms?session_id=${sessionId}${code ? `&force=${code}` : ''}`);
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
