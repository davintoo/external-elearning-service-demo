import express from 'express';

import {CHECKLIST} from './checklist.js';
import {buildResultPayload} from './payload.js';
import {LmsError} from './errors.js';
import {demoLmsRouter} from './demo-lms.js';

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

export function createApp({config, client, webDist = null}) {
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

    app.use('/demo', demoLmsRouter(config));

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

    // Built single-port mode: the API also serves the compiled Angular app, so the host page
    // and the simulator share one origin and 'self' is a sufficient frame-ancestors policy.
    if (webDist) {
        app.use(express.static(webDist));
        app.get(/^\/(?!api\/|demo\/).*/, (req, res) => {
            res.sendFile('index.html', {root: webDist});
        });
    }

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
