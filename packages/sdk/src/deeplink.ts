export const DEFAULT_VERIFY_BASE_URL = 'https://verify.meum.id';

/** Builds the verification deep link the RP hands to the holder. */
export function deepLink(sessionId: string, verifyBaseUrl: string = DEFAULT_VERIFY_BASE_URL): string {
  return `${verifyBaseUrl}/session?id=${encodeURIComponent(sessionId)}`;
}
