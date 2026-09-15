/**
 * The published SessionId pattern, verbatim: lowercase hex only, unbraced, version nibble 4
 * and an RFC-4122 variant nibble. Deliberately stricter than a general-purpose UUID check,
 * because the contract is - anything else is not an id the LMS could have minted.
 */
export const SESSION_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
