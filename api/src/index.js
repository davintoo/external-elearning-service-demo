import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {envFilePath, loadConfig} from './config.js';
import {createLmsClient} from './lms/index.js';
import {createApp} from './app.js';

try {
    // Node loads .env natively; its absence is the normal case for the mock demo.
    process.loadEnvFile(envFilePath());
} catch {
    // no .env file — mock mode
}

const config = loadConfig();
const distPath = fileURLToPath(new URL('../../web/dist/web/browser', import.meta.url));
const webDist = existsSync(distPath) ? distPath : null;

const app = createApp({config, client: createLmsClient(config), webDist});

app.listen(config.port, () => {
    console.log(`demo api listening on http://localhost:${config.port} [${config.mode} mode]`);
    if (config.mode === 'mock') {
        console.log('no LMS configured — set LMS_BASE_URL and LMS_API_TOKEN for live mode');
    }
    console.log(webDist
        ? `serving the built simulator from ${webDist}`
        : 'no build found — run `npm run build --workspace=web` or use the dev server on :4200');
});
