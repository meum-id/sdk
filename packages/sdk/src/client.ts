import { MAX_CONJUNCTION_SIZE, NAMED_CLAIMS, type NamedClaim } from '@meum/contracts/claims';
import { type Jwks, type VerifyResult, verify } from '@meum/verify';
import { DEFAULT_VERIFY_BASE_URL, deepLink } from './deeplink';
import { apiErrorFrom, MeumNetworkError, MeumValidationError, parseErrorBody } from './errors';
import { toCamelCase, toSnakeCase } from './transform';

export const DEFAULT_API_BASE_URL = 'https://api.meum.id';
export const JWKS_CACHE_TTL_MS = 3_600_000;

/** Client-side predicate shape; `allOf` maps to the wire `all_of`. */
export type Predicate = NamedClaim | { allOf: NamedClaim[] };

export interface CreateSessionInput {
  predicate: Predicate;
  returnUrl: string;
  metadata?: Record<string, unknown>;
}

export interface CreatedSession {
  sessionId: string;
  verificationUrl: string;
  nonce: string;
  expiresAt: string;
}

export interface VerifyReceiptOptions {
  expectedAudience: string;
  expectedNonce: string;
  expectedSessionId?: string;
  now?: number | Date;
}

export interface MeumClientOptions {
  /** RP API key (`mm_…`). */
  apiKey: string;
  baseUrl?: string;
  verifyBaseUrl?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  jwksCacheTtlMs?: number;
  /** Injectable clock (epoch ms) for the JWKS cache; defaults to `Date.now`. */
  nowMs?: () => number;
}

interface CachedJwks {
  jwks: Jwks;
  fetchedAt: number;
}

function isNamedClaim(value: unknown): value is NamedClaim {
  return typeof value === 'string' && (NAMED_CLAIMS as readonly string[]).includes(value);
}

function assertValidPredicate(predicate: Predicate): void {
  if (isNamedClaim(predicate)) {
    return;
  }
  if (typeof predicate === 'object' && predicate !== null && Array.isArray(predicate.allOf)) {
    const claims = predicate.allOf;
    const valid =
      claims.length >= 1 &&
      claims.length <= MAX_CONJUNCTION_SIZE &&
      claims.every(isNamedClaim) &&
      new Set(claims).size === claims.length;
    if (valid) {
      return;
    }
  }
  throw new MeumValidationError(
    `invalid predicate: expected one of [${NAMED_CLAIMS.join(', ')}] or { allOf: [1..${MAX_CONJUNCTION_SIZE} unique claims] }`,
  );
}

function assertCreatedSession(value: unknown): asserts value is CreatedSession {
  const session = value as Partial<CreatedSession> | null;
  const valid =
    session !== null &&
    typeof session === 'object' &&
    typeof session.sessionId === 'string' &&
    typeof session.verificationUrl === 'string' &&
    typeof session.nonce === 'string' &&
    typeof session.expiresAt === 'string';
  if (!valid) {
    throw new MeumNetworkError('malformed session-create response');
  }
}

export class MeumClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly verifyBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly jwksCacheTtlMs: number;
  private readonly nowMs: () => number;
  private readonly jwksCache = new Map<string, CachedJwks>();

  constructor(options: MeumClientOptions) {
    if (!options.apiKey) {
      throw new MeumValidationError('apiKey is required');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
    this.verifyBaseUrl = options.verifyBaseUrl ?? DEFAULT_VERIFY_BASE_URL;
    this.fetchImpl = options.fetch ?? fetch;
    this.jwksCacheTtlMs = options.jwksCacheTtlMs ?? JWKS_CACHE_TTL_MS;
    this.nowMs = options.nowMs ?? Date.now;
  }

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    assertValidPredicate(input.predicate);
    if (!input.returnUrl.startsWith('https://')) {
      throw new MeumValidationError('returnUrl must be an https URL');
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/sessions/create`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(toSnakeCase(input)),
      });
    } catch (cause) {
      throw new MeumNetworkError('session creation request failed', { cause });
    }
    if (!response.ok) {
      throw await this.toApiError(response);
    }
    const created = toCamelCase(await response.json());
    assertCreatedSession(created);
    return created;
  }

  deepLink(sessionId: string): string {
    return deepLink(sessionId, this.verifyBaseUrl);
  }

  /**
   * Offline receipt verification via `@meum/verify`, with a per-kid JWKS
   * cache (1h). A key miss served from cache busts the entry and re-verifies
   * against a fresh JWKS fetch once.
   */
  async verifyReceipt(receipt: string, options: VerifyReceiptOptions): Promise<VerifyResult> {
    let cacheHitKid: string | null = null;
    const first = await verify(receipt, {
      ...options,
      jwksResolver: async (kid) => {
        const cached = this.cachedJwks(kid);
        if (cached) {
          cacheHitKid = kid;
          return cached;
        }
        return this.fetchJwks(kid);
      },
    });
    if ((first.reason === 'unknown_kid' || first.reason === 'key_not_active') && cacheHitKid) {
      this.jwksCache.delete(cacheHitKid);
      return verify(receipt, {
        ...options,
        jwksResolver: (kid) => this.fetchJwks(kid),
      });
    }
    return first;
  }

  private cachedJwks(kid: string): Jwks | null {
    const cached = this.jwksCache.get(kid);
    if (cached && this.nowMs() - cached.fetchedAt < this.jwksCacheTtlMs) {
      return cached.jwks;
    }
    this.jwksCache.delete(kid);
    return null;
  }

  private async fetchJwks(kid: string): Promise<Jwks | null> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/.well-known/jwks.json?kid=${encodeURIComponent(kid)}`);
    } catch (cause) {
      throw new MeumNetworkError('JWKS fetch failed', { cause });
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw await this.toApiError(response);
    }
    const jwks = (await response.json()) as Jwks;
    this.jwksCache.set(kid, { jwks, fetchedAt: this.nowMs() });
    return jwks;
  }

  private async toApiError(response: Response): Promise<Error> {
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    const body = parseErrorBody(parsed);
    if (body) {
      return apiErrorFrom(response.status, body);
    }
    return new MeumNetworkError(`unexpected API response (HTTP ${response.status})`);
  }
}
