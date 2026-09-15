import {readLaunch} from './launch';

describe('readLaunch', () => {
  it('reads the session id the LMS appended to the launch url', () => {
    const launch = readLaunch('?session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
    expect(launch.sessionId).toBe('b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
    expect(launch.force).toBeNull();
  });

  it('keeps whatever query string the administrator already configured', () => {
    const launch = readLaunch('?lang=uk&session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
    expect(launch.sessionId).toBe('b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101');
  });

  it('reports no session when launched outside the LMS', () => {
    expect(readLaunch('').sessionId).toBeNull();
    expect(readLaunch('?lang=uk').sessionId).toBeNull();
  });

  it('rejects a malformed session id instead of sending it to the LMS', () => {
    expect(readLaunch('?session_id=nonsense').sessionId).toBeNull();
    expect(readLaunch('?session_id=B3F1C9E2-4A17-4C0E-9F31-8A2D5E77B101').sessionId).toBeNull();
  });

  it('carries the mock force parameter through', () => {
    const launch = readLaunch('?session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101&force=410');
    expect(launch.force).toBe('410');
  });
});
