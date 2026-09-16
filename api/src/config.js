import {fileURLToPath} from 'node:url';

const DEFAULT_PORT = 3000;

/**
 * The env file lives in `config/`, resolved from this module rather than from
 * `process.cwd()`. Two reasons, both of which bit this repo:
 *
 * 1. cwd differs by how the process starts — `api/` under `npm start --workspace=api`,
 *    `/app` in the image — so a cwd-relative lookup silently reads a different path in
 *    each, and the one the README documented was never read in Docker at all.
 * 2. `config/` holds nothing but env files, so it is safe to mount over. A secret bind-
 *    mounted as a directory replaces its target, and every target inside `api/` sits on
 *    top of the source tree — mounting one there deletes `api/src` from the container's
 *    view and the process dies with `Cannot find module '/app/api/src/index.js'`.
 *
 * ENV_FILE overrides the path outright, for deployments that place secrets elsewhere.
 */
export function envFilePath(env = process.env) {
    return env.ENV_FILE?.trim() || fileURLToPath(new URL('../../config/.env', import.meta.url));
}

/**
 * Refuses to start rather than accept a base url no request could ever use.
 *
 * Presence alone was the test once, and a deployment whose secret still held the literal
 * `{lms_base_url}` passed it: non-empty, so live mode, and then every LMS call died in
 * `fetch` with "Failed to parse URL" while `/api/config` and the whole UI kept answering
 * 200. Nothing reached the logs, because a handled LmsError does not log. An untemplated
 * placeholder is a broken deployment, not a request-time misfortune, so it is caught here —
 * once, at boot, naming the variable and the value — instead of once per request forever.
 *
 * Absence still means mock mode. Only a value that cannot work is fatal.
 */
function requireUsableBaseUrl(lmsBaseUrl) {
    let parsed;
    try {
        parsed = new URL(lmsBaseUrl);
    } catch {
        throw new Error(
            `LMS_BASE_URL is not a usable URL: ${JSON.stringify(lmsBaseUrl)}. ` +
            'Set it to an absolute http(s) url, or unset it (with LMS_API_TOKEN) for mock mode.'
        );
    }

    // `new URL('lms.example.com:443')` parses happily, with protocol "lms.example.com:",
    // so a missing scheme has to be rejected on the protocol rather than on the parse.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(
            `LMS_BASE_URL must be http or https, not ${JSON.stringify(parsed.protocol)}: ` +
            `${JSON.stringify(lmsBaseUrl)}`
        );
    }
}

/**
 * Mode is derived, never configured: holding both a base url and a token is the only
 * thing that makes a live call possible, so a half-configured .env stays safely on the
 * mock rather than failing every request at runtime.
 */
export function loadConfig(env = process.env) {
    const lmsBaseUrl = (env.LMS_BASE_URL || '').trim().replace(/\/+$/, '');
    const lmsApiToken = (env.LMS_API_TOKEN || '').trim();

    if (lmsBaseUrl) {
        requireUsableBaseUrl(lmsBaseUrl);
    }

    return {
        port: Number(env.PORT) || DEFAULT_PORT,
        mode: lmsBaseUrl && lmsApiToken ? 'live' : 'mock',
        lmsBaseUrl,
        lmsApiToken,
        frameAncestors: (env.ALLOWED_FRAME_ANCESTORS || "'self'").trim()
    };
}
