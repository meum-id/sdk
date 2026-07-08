/**
 * Deep camelCase<->snake_case key transforms for the wire boundary. The
 * `metadata` and `details` subtrees are opaque wire values and pass through
 * untouched.
 */

const OPAQUE_KEYS = new Set(['metadata', 'details']);

export function camelToSnakeKey(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function transformDeep(value: unknown, transformKey: (key: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => transformDeep(item, transformKey));
  }
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const nextKey = transformKey(key);
      result[nextKey] = OPAQUE_KEYS.has(nextKey) ? child : transformDeep(child, transformKey);
    }
    return result;
  }
  return value;
}

export function toSnakeCase<T = unknown>(value: unknown): T {
  return transformDeep(value, camelToSnakeKey) as T;
}

export function toCamelCase<T = unknown>(value: unknown): T {
  return transformDeep(value, snakeToCamelKey) as T;
}
