import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const lockText = await Bun.file(join(root, 'bun.lock')).text();
const packageDirs = readdirSync(join(root, 'packages')).sort();

function lockWorkspaceVersion(dir: string): string | null {
  const match = lockText.match(new RegExp(`"packages/${dir}":\\s*\\{[^}]*?"version":\\s*"([^"]+)"`));
  return match?.[1] ?? null;
}

// `bun install` does not rewrite the workspaces version fields in bun.lock after a
// package.json version bump, and `--frozen-lockfile` accepts the stale lock, so this
// is the only check that catches the drift. See RELEASES.md "Version bump".
describe('bun.lock workspace versions', () => {
  test('every workspace package is present in the lock', () => {
    expect(packageDirs.length).toBeGreaterThan(0);
    for (const dir of packageDirs) {
      expect(lockWorkspaceVersion(dir)).not.toBeNull();
    }
  });

  test.each(packageDirs)('packages/%s version matches its bun.lock workspaces entry', async (dir) => {
    const manifest = (await Bun.file(join(root, 'packages', dir, 'package.json')).json()) as { version?: string };
    expect(manifest.version).toBeDefined();
    expect(lockWorkspaceVersion(dir)).toBe(manifest.version as string);
  });
});
