/**
 * The published SessionId pattern, verbatim: lowercase hex, unbraced, version nibble 4.
 * Anything else is not a session id the LMS could have minted, so it is treated as no
 * session at all rather than passed on for the LMS to reject.
 */
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface Launch {
  sessionId: string | null;
  force: string | null;
}

export function readLaunch(search: string): Launch {
  const params = new URLSearchParams(search);
  const sessionId = params.get('session_id') ?? '';

  return {
    sessionId: SESSION_ID_PATTERN.test(sessionId) ? sessionId : null,
    force: params.get('force')
  };
}
