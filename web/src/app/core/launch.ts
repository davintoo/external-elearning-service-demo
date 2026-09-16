/**
 * The published SessionId pattern, verbatim: lowercase hex, unbraced, version nibble 4.
 * Anything else is not a session id the LMS could have minted, so it is treated as no
 * session at all rather than passed on for the LMS to reject.
 */
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The name a pym parent gives the frame it created, echoed back in every message we send it.
 *
 * Validated rather than merely read, because it is interpolated into the message string: a
 * host passing `childId=a xPYMx height xPYMx 99999` would otherwise be able to forge message
 * boundaries inside a payload we assemble.
 */
const CHILD_ID_PATTERN = /^[\w-]{1,64}$/;

export interface Launch {
  sessionId: string | null;
  force: string | null;
  childId: string | null;
}

export function readLaunch(search: string): Launch {
  const params = new URLSearchParams(search);
  const sessionId = params.get('session_id') ?? '';
  const childId = params.get('childId') ?? '';

  return {
    sessionId: SESSION_ID_PATTERN.test(sessionId) ? sessionId : null,
    force: params.get('force'),
    childId: CHILD_ID_PATTERN.test(childId) ? childId : null
  };
}
