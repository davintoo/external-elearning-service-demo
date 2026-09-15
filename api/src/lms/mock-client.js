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
            // One entry per rejected field, keyed by the TOP-LEVEL field name, carrying the
            // most specific reason available. Both halves take work:
            //
            // The key: ajv reports a missing required property with an empty instancePath
            // and the name in params, so keying off instancePath alone files "session_id is
            // missing" under "body" - useless to the integrator trying to fix it.
            //
            // The message: `data` is a oneOf, so ajv reports failures from BOTH branches
            // plus a generic "must match exactly one schema in oneOf". The branch actually
            // meant fails deepest - at the offending item - while the wrong branch fails
            // shallowly on its `format` discriminator. So the deepest error is both the most
            // specific and the one from the right branch, and the generic oneOf sentence,
            // which names nothing, may only win when there is nothing else.
            const best = new Map();

            for (const error of validateRequest.errors) {
                const path = (error.instancePath || '').split('/').filter(Boolean);
                const field = path[0] ||
                    error.params?.missingProperty ||
                    error.params?.additionalProperty ||
                    'body';

                const rank = error.keyword === 'oneOf' ? -1 : path.length;
                const chosen = best.get(field);
                if (!chosen || rank > chosen.rank) {
                    best.set(field, {rank, error});
                }
            }

            const fields = {};
            for (const [field, {error}] of best) {
                fields[field] = error.instancePath
                    ? `"${error.instancePath.slice(1).replace(/\//g, '.')}" ${error.message}`
                    : error.message;
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
