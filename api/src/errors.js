/**
 * One error type for everything the LMS can answer with. `key` is the machine-readable key
 * from the published ErrorResponse, which is what the web app switches on to show a message
 * an integrator can act on.
 */
export class LmsError extends Error {
    constructor(status, key, message, fields = null) {
        super(message);
        this.name = 'LmsError';
        this.status = status;
        this.key = key;
        this.fields = fields;
    }

    toJSON() {
        const body = {status: this.status, key: this.key, message: this.message};
        if (this.fields) {
            body.fields = this.fields;
        }
        return body;
    }
}

const FORCEABLE = {
    400: () => new LmsError(400, 'validation_error', 'The LMS rejected the payload', {
        mark: '"mark" must be less than or equal to 100'
    }),
    401: () => new LmsError(401, 'unauthorized', 'API token is missing, unknown or expired'),
    403: () => new LmsError(403, 'forbidden', 'Permission denied'),
    404: () => new LmsError(404, 'not_found', `Session not found`),
    409: () => new LmsError(409, 'resource_not_external', 'Resource does not accept external data'),
    410: () => new LmsError(410, 'session_expired', 'Task deadline has passed'),
    429: () => new LmsError(429, 'too_many_requests', 'Too many requests')
};

/**
 * Mock-only. Lets the demo show every documented failure branch without anyone having to
 * break a real LMS to see one.
 */
export function forcedError(code) {
    const make = FORCEABLE[Number(code)];
    return make ? make() : null;
}
