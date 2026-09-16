import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {envFilePath, loadConfig} from '../src/config.js';

test('defaults to mock mode when no LMS credentials are set', () => {
    const config = loadConfig({});
    assert.equal(config.mode, 'mock');
    assert.equal(config.port, 3000);
    assert.equal(config.frameAncestors, "'self'");
});

test('stays in mock mode when only one credential is set', () => {
    assert.equal(loadConfig({LMS_BASE_URL: 'https://lms.example.com'}).mode, 'mock');
    assert.equal(loadConfig({LMS_API_TOKEN: 'tok'}).mode, 'mock');
});

test('switches to live mode when both credentials are set', () => {
    const config = loadConfig({
        LMS_BASE_URL: 'https://lms.example.com',
        LMS_API_TOKEN: 'tok'
    });
    assert.equal(config.mode, 'live');
    assert.equal(config.lmsApiToken, 'tok');
});

test('refuses an untemplated placeholder instead of booting into a broken live mode', () => {
    // Shipped exactly this way: the deployment secret still held the literal placeholder, so
    // presence-only validation read it as live mode and every LMS call then died inside
    // fetch, unlogged, while the rest of the app kept answering 200.
    assert.throws(
        () => loadConfig({LMS_BASE_URL: '{lms_base_url}', LMS_API_TOKEN: '{lms_api_token}'}),
        error => {
            assert.match(error.message, /LMS_BASE_URL is not a usable URL/);
            assert.match(error.message, /\{lms_base_url\}/);
            return true;
        }
    );
});

test('refuses a base url with no scheme, which URL() would otherwise accept', () => {
    // `new URL('lms.example.com:443')` parses, with protocol "lms.example.com:" — so this
    // has to be caught on the protocol, not on the parse.
    assert.throws(
        () => loadConfig({LMS_BASE_URL: 'lms.example.com:443', LMS_API_TOKEN: 'tok'}),
        /must be http or https/
    );
});

test('a bad base url is fatal even without a token, so a half-templated secret still shows', () => {
    assert.throws(() => loadConfig({LMS_BASE_URL: '{lms_base_url}'}), /not a usable URL/);
});

test('strips trailing slashes from the base url so path joins never double up', () => {
    const config = loadConfig({
        LMS_BASE_URL: 'https://lms.example.com///',
        LMS_API_TOKEN: 'tok'
    });
    assert.equal(config.lmsBaseUrl, 'https://lms.example.com');
});

test('reads port and frame ancestors from the environment', () => {
    const config = loadConfig({PORT: '8080', ALLOWED_FRAME_ANCESTORS: "'self' https://lms.example.com"});
    assert.equal(config.port, 8080);
    assert.equal(config.frameAncestors, "'self' https://lms.example.com");
});

test('resolves the env file from the module location, not the working directory', () => {
    // A cwd-relative lookup read `api/.env` under `npm start --workspace=api` and
    // `/app/.env` in the image — two different files for one documented setting.
    const original = process.cwd();
    try {
        process.chdir(tmpdir());
        assert.equal(envFilePath({}), fileURLToPath(new URL('../../config/.env', import.meta.url)));
    } finally {
        process.chdir(original);
    }
});

test('ENV_FILE overrides the env file path, and a blank one falls back to the default', () => {
    assert.equal(envFilePath({ENV_FILE: '/run/secrets/demo.env'}), '/run/secrets/demo.env');
    assert.equal(envFilePath({ENV_FILE: '  '}), fileURLToPath(new URL('../../config/.env', import.meta.url)));
});
