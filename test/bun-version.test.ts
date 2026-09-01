import { describe, expect, test } from 'bun:test';
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const pinned = readFileSync(join(root, '.bun-version'), 'utf8').trim();
const workflows = globSync('.github/workflows/*.yml', { cwd: root });

// Every workflow passed `bun-version: latest`, so an upstream release could
// change the toolchain that lints, tests, and publishes this package with no
// commit here. This file is the pin; these assertions keep it the only one.
describe('the Bun version is declared once, in the tree', () => {
  test('.bun-version holds a bare version', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('no workflow restates the version', () => {
    expect(workflows.length).toBeGreaterThan(0);
    for (const file of workflows) {
      const wf = readFileSync(join(root, file), 'utf8');
      expect(wf, `${file} must not pin a Bun version inline`).not.toMatch(/bun-version:\s*['"]?[\w.]/);
    }
  });

  test('every direct setup-bun step reads the file', () => {
    // A step calling setup-bun with neither input falls through to
    // package.json and then to `latest`, and that read is silent.
    for (const file of workflows) {
      const wf = readFileSync(join(root, file), 'utf8').split('\n');
      const steps = wf.filter((l) => l.includes('oven-sh/setup-bun')).length;
      const reads = wf.filter((l) => l.includes('bun-version-file: .bun-version')).length;
      expect(reads, `${file} has ${steps} setup-bun step(s) but ${reads} reading .bun-version`).toBe(steps);
    }
  });

  test('bun-types tracks the pinned runtime', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const [major, minor] = pinned.split('.');
    expect(pkg.devDependencies['bun-types']).toBe(`^${major}.${minor}.0`);
  });

  test('the runtime running this suite is the pinned one', () => {
    // Guards the split this pin exists to prevent: CI and local development on
    // different Bun builds, disagreeing on emitted bytes while tests stay green.
    // Resolve by installing the pinned version or bumping .bun-version.
    expect(Bun.version).toBe(pinned);
  });
});
