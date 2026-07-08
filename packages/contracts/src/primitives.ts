import { z } from 'zod';
import { ID_PREFIXES } from './ids';

/** RFC 3339 / ISO 8601 timestamp with a UTC designator or offset. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const Base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, 'expected unpadded base64url');

/** 32 bytes of unpadded base64url is exactly 43 characters. */
export const Base64Url32ByteSchema = Base64UrlSchema.length(43);

/** 24 bytes of unpadded base64url is exactly 32 characters. */
export const Base64Url24ByteSchema = Base64UrlSchema.length(32);

export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'expected lowercase SHA-256 hex');

export const HttpsUrlSchema = z.url().refine((url) => url.startsWith('https://'), { message: 'URL must use https' });

export const CompactJwtSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'expected a compact JWS (three base64url segments)');

export const SessionIdSchema = z.string().startsWith(ID_PREFIXES.session).min(6);
export const KidSchema = z.string().startsWith(ID_PREFIXES.deviceKey).min(5);
export const RpIdSchema = z.string().startsWith(ID_PREFIXES.relyingParty).min(4);

/** Opaque CSPRNG session nonce (the backend uses `crypto.randomUUID()`). */
export const NonceSchema = z.string().min(16);
