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
