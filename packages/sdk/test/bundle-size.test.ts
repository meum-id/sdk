import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const LIMIT_BYTES = 50 * 1024;

// Static chunk references in minified output: `from"./chunk-x.js"` or a bare
// `import"./chunk-x.js"`. Dynamic imports keep their parentheses
// (`import("./chunk-x.js")`) and stay out of the eager graph.
const STATIC_CHUNK_IMPORT = /(?:from|import)"\.\/([^"]+)"/g;

describe('bundle size', () => {
  test('eagerly loaded @meum/sdk code stays under 50KB minified + gzipped', async () => {
    const outdir = mkdtempSync(join(tmpdir(), 'meum-sdk-bundle-'));
    try {
      const build = await Bun.build({
        entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
        target: 'browser',
        format: 'esm',
        minify: true,
        // Splitting mirrors real consumer bundlers: @meum/verify loads
        // @hpke/core behind a dynamic import, so the sealed-envelope crypto
        // is a lazy chunk a v1-only consumer never downloads. The budget
        // guards the eager graph — the bytes every consumer pays up front.
        splitting: true,
        outdir,
      });
      expect(build.success).toBe(true);
      const outputs = new Map(build.outputs.map((output) => [basename(output.path), output]));
      const entry = build.outputs.find((output) => output.kind === 'entry-point');
      expect(entry).toBeDefined();

      const eager = new Set<string>();
      const queue = [basename((entry as (typeof build.outputs)[number]).path)];
      while (queue.length > 0) {
        const name = queue.pop() as string;
        if (eager.has(name) || !outputs.has(name)) {
          continue;
        }
        eager.add(name);
        const source = await outputs.get(name)!.text();
        for (const match of source.matchAll(STATIC_CHUNK_IMPORT)) {
          queue.push(match[1] as string);
        }
      }

      let eagerGzipped = 0;
      for (const name of eager) {
        const bundled = await outputs.get(name)!.arrayBuffer();
        eagerGzipped += Bun.gzipSync(new Uint8Array(bundled)).byteLength;
      }
      console.log(`@meum/sdk eager graph (${[...eager].join(', ')}): ${eagerGzipped} bytes gzipped`);
      expect(eagerGzipped).toBeLessThan(LIMIT_BYTES);
    } finally {
      rmSync(outdir, { recursive: true, force: true });
    }
  });
});
