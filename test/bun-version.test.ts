import { describe, expect, test } from 'bun:test';
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const pinned = readFileSync(join(root, '.bun-version'), 'utf8').trim();
const workflows = globSync('.github/workflows/*.yml', { cwd: root });

// `.bun-version` is the only place this repo names a Bun version. Workflows
// that call a shared reusable inherit it, and any step invoking setup-bun
// directly reads it through `bun-version-file`.
//
// setup-bun resolves `bun-version`, then `bun-version-file`, then package.json,
// then `latest`. The package.json read is silent, so a pin that resolves to
// nothing installs an arbitrary version while the job still reports success.
// These assertions keep every path anchored to the file.
describe('the Bun version is declared once, in the tree', () => {
  test('.bun-version holds a bare version', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('no workflow restates the version', () => {
    expect(workflows.length).toBeGreaterThan(0);
    for (const file of workflows) {
      const wf = readFileSync(join(root, file), 'utf8');
      // Matches any value, not just a digit: `latest` is the drift this exists
      // to stop, and a digit-anchored pattern reads clean while it ships.
      expect(wf, `${file} must not pin a Bun version inline`).not.toMatch(/bun-version:\s*['"]?[\w.]/);
    }
  });

  test('every direct setup-bun step reads the file', () => {
    for (const file of workflows) {
      const lines = readFileSync(join(root, file), 'utf8').split('\n');
      const steps = lines.filter((l) => l.includes('oven-sh/setup-bun')).length;
      const reads = lines.filter((l) => l.includes('bun-version-file: .bun-version')).length;
      expect(reads, `${file} has ${steps} setup-bun step(s) but ${reads} reading .bun-version`).toBe(steps);
    }
  });

  test('bun-types tracks the pinned runtime', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const [major, minor] = pinned.split('.');
    expect(pkg.devDependencies['bun-types']).toBe(`^${major}.${minor}.0`);
  });

  test('the runtime running this suite is the pinned one', () => {
    // The only assertion that can see a split between the Bun CI installs and
    // the Bun a developer builds with. A workflow-only check compares the
    // workflows to each other, and they can be uniformly wrong. Resolve by
    // installing the pinned version or bumping .bun-version deliberately.
    expect(Bun.version).toBe(pinned);
  });
});
