import { describe, expect, test } from 'bun:test';

const LIMIT_BYTES = 50 * 1024;

describe('bundle size', () => {
  test('minified + gzipped @meum/sdk stays under 50KB', async () => {
    const build = await Bun.build({
      entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
      target: 'browser',
      format: 'esm',
      minify: true,
    });
    expect(build.success).toBe(true);
    const bundled = await build.outputs[0]!.arrayBuffer();
    const gzipped = Bun.gzipSync(new Uint8Array(bundled));
    console.log(`@meum/sdk bundle: ${bundled.byteLength} bytes raw, ${gzipped.byteLength} bytes gzipped`);
    expect(gzipped.byteLength).toBeLessThan(LIMIT_BYTES);
  });
});
