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
