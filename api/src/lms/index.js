import {MockLmsClient} from './mock-client.js';
import {LiveLmsClient} from './live-client.js';

export function createLmsClient(config) {
    if (config.mode === 'live') {
        return new LiveLmsClient({baseUrl: config.lmsBaseUrl, token: config.lmsApiToken});
    }
    return new MockLmsClient();
}
