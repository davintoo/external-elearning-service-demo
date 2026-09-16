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
