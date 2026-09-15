const DEFAULT_PORT = 3000;

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
