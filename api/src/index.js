import {loadConfig} from './config.js';
import {createLmsClient} from './lms/index.js';
import {createApp} from './app.js';

try {
    // Node loads .env natively; its absence is the normal case for the mock demo.
    process.loadEnvFile();
} catch {
    // no .env file — mock mode
}

const config = loadConfig();
const app = createApp({config, client: createLmsClient(config)});

app.listen(config.port, () => {
    console.log(`demo api listening on http://localhost:${config.port} [${config.mode} mode]`);
    if (config.mode === 'mock') {
        console.log('no LMS configured — set LMS_BASE_URL and LMS_API_TOKEN for live mode');
    }
});
