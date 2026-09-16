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
 * Mode is derived, never configured: holding both a base url and a token is the only
 * thing that makes a live call possible, so a half-configured .env stays safely on the
 * mock rather than failing every request at runtime.
 */
export function loadConfig(env = process.env) {
    const lmsBaseUrl = (env.LMS_BASE_URL || '').trim().replace(/\/+$/, '');
    const lmsApiToken = (env.LMS_API_TOKEN || '').trim();

    return {
        port: Number(env.PORT) || DEFAULT_PORT,
        mode: lmsBaseUrl && lmsApiToken ? 'live' : 'mock',
        lmsBaseUrl,
        lmsApiToken,
        frameAncestors: (env.ALLOWED_FRAME_ANCESTORS || "'self'").trim()
    };
}
