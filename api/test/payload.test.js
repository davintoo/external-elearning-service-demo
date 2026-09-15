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
