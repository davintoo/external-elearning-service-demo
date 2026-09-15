import {LmsError} from '../errors.js';

function toLmsError(status, body) {
    // 400 is the only shape with per-field detail: {data: {field: message}}.
    if (status === 400) {
        return new LmsError(400, 'validation_error', 'The LMS rejected the payload',
            body && body.data ? body.data : {});
    }

    // Everything else is a single {key: message} pair.
    const key = body && typeof body === 'object' ? Object.keys(body)[0] : null;
    return new LmsError(status, key || 'lms_error',
        key ? String(body[key]) : `LMS returned HTTP ${status}`);
}

export class LiveLmsClient {
    constructor({baseUrl, token, fetchImpl = fetch}) {
        this.mode = 'live';
        this.baseUrl = baseUrl;
        this.token = token;
        this.fetchImpl = fetchImpl;
    }

    async _call(path, init = {}) {
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                ...init,
                headers: {
                    // Caller-supplied headers are spread FIRST so they can never override the
                    // defaults below. If they were spread last, any caller passing its own
                    // `init.headers` (even by accident, e.g. forwarding an unrelated header)
                    // could clobber the auth token or content type sent to the LMS.
                    ...(init.headers || {}),
                    // The API token goes in its own header, never in Authorization, and never
                    // anywhere the browser can see it.
                    'x-cbr-authorization': `Bearer ${this.token}`,
                    'content-type': 'application/json; charset=utf-8'
                }
            });
        } catch (cause) {
            // DNS, TLS, refused connection. The learner's answers are still in their browser,
            // so this must read as "we could not reach the LMS", not as a rejected result.
            throw new LmsError(502, 'lms_unreachable',
                `Could not reach the LMS at ${this.baseUrl}: ${cause.message}`);
        }

        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }

        if (!response.ok) {
            throw toLmsError(response.status, body);
        }

        return body;
    }

    getSession(sessionId) {
        return this._call(
            `/api/v2/external-resources/sessions/${encodeURIComponent(sessionId)}`
        );
    }

    saveResult(payload) {
        return this._call('/api/v2/external-resources/sessions/result', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }
}
