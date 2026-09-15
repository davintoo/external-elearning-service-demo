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

test('a 400 without per-field detail still maps to validation_error with empty fields', async () => {
    const fetchImpl = respond(400, {message: 'Bad request'});
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    await assert.rejects(() => client.saveResult({}), err =>
        err instanceof LmsError &&
        err.status === 400 &&
        err.key === 'validation_error' &&
        err.fields !== null &&
        Object.keys(err.fields).length === 0);
});

test('a non-JSON error body still produces a usable error, never a crash', async () => {
    const fetchImpl = async (url, init) => {
        respond.lastUrl = url;
        respond.lastInit = init;
        return {ok: false, status: 500, text: async () => 'Internal Server Error'};
    };
    const client = new LiveLmsClient({baseUrl: 'https://lms.example.com', token: 'tok', fetchImpl});

    await assert.rejects(() => client.getSession(SESSION_ID), err =>
        err instanceof LmsError && err.status === 500 && err.key === 'lms_error' &&
        !err.message.includes('tok'));
});

test('the factory picks the client from the resolved mode', () => {
    assert.ok(createLmsClient({mode: 'mock'}) instanceof MockLmsClient);
    assert.ok(createLmsClient({
        mode: 'live', lmsBaseUrl: 'https://lms.example.com', lmsApiToken: 'tok'
    }) instanceof LiveLmsClient);
});
