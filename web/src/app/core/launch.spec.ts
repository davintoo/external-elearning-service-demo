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

  it('reads the child id a pym parent named the frame with', () => {
    const launch = readLaunch(
      '?session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101&childId=cbr-external-0'
    );
    expect(launch.childId).toBe('cbr-external-0');
  });

  it('reports no child id when the host does not speak pym', () => {
    expect(readLaunch('?session_id=b3f1c9e2-4a17-4c0e-9f31-8a2d5e77b101').childId).toBeNull();
  });

  it('rejects a child id that could forge pym message boundaries', () => {
    // The child id is interpolated into the message string, so a host that could smuggle the
    // delimiter in could append fields of its own to a payload we assemble.
    expect(readLaunch('?childId=a xPYMx height xPYMx 99999').childId).toBeNull();
    expect(readLaunch('?childId=' + 'x'.repeat(65)).childId).toBeNull();
    expect(readLaunch('?childId=').childId).toBeNull();
  });
});
