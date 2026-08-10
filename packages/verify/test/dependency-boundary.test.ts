import { describe, expect, test } from 'bun:test';
import sdkManifestJson from '../../sdk/package.json';
import verifyManifestJson from '../package.json';

type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const sdkManifest = sdkManifestJson as Manifest;
const verifyManifest = verifyManifestJson as Manifest;

// @meum/verify's single runtime dependency is @hpke/core (vetted RFC 9180 HPKE
// for the sealed-envelope path; hand-rolled crypto is forbidden here);
// @meum/sdk depends only on the two client packages. An HTTP/OpenAPI/server
// dependency (hono, @hono/zod-openapi) leaking into either runtime surface is
// the failure this guards against. Fail closed on any dep outside the allowlist.
const RUNTIME_ALLOWLIST: Record<string, Set<string>> = {
  '@meum/verify': new Set(['@hpke/core']),
  '@meum/sdk': new Set(['@meum/contracts', '@meum/verify']),
};

function forbiddenRuntimeDeps(name: string, deps: Record<string, string> | undefined): string[] {
  const allowed = RUNTIME_ALLOWLIST[name] ?? new Set<string>();
  return Object.keys(deps ?? {}).filter((dep) => !allowed.has(dep));
}

describe('client dependency boundary', () => {
  test('@meum/verify declares exactly {@hpke/core} as runtime dependencies', () => {
    expect(forbiddenRuntimeDeps('@meum/verify', verifyManifest.dependencies)).toEqual([]);
    expect(Object.keys(verifyManifest.dependencies ?? {})).toEqual(['@hpke/core']);
  });

  test('@meum/sdk runtime deps are a subset of {@meum/contracts, @meum/verify}', () => {
    expect(forbiddenRuntimeDeps('@meum/sdk', sdkManifest.dependencies)).toEqual([]);
  });

  test('a server dependency in sdk runtime deps fails the guard', () => {
    const fixture = { '@meum/contracts': '^0.2.0', '@meum/verify': 'workspace:*', hono: '^4.0.0' };
    expect(forbiddenRuntimeDeps('@meum/sdk', fixture)).toEqual(['hono']);
  });

  test("verify's devDependencies do not trip the runtime allowlist", () => {
    expect(forbiddenRuntimeDeps('@meum/verify', verifyManifest.devDependencies)).not.toEqual([]);
    expect(forbiddenRuntimeDeps('@meum/verify', verifyManifest.dependencies)).toEqual([]);
  });
});
