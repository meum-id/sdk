/** Frozen wire identifier prefixes. */
export const ID_PREFIXES = {
  apiKey: 'mm_',
  session: 'sess_',
  deviceKey: 'kid_',
  request: 'req_',
  relyingParty: 'rp_',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];
