import type { AnyVizDef, OpCall, SavedExample, Scalar, SettingSpec, Settings } from './types';

/** A problem with an example that the learner can understand. The message is shown as is. */
export class ExampleError extends Error {
  override name = 'ExampleError';
}

const BAD_LINK = 'That link is not a valid example. It may have been cut off when it was copied.';

/** Fill in missing settings, drop unknown ones, and clamp values to what the spec allows. */
export function normalizeSettings(
  specs: SettingSpec[],
  defaults: Settings,
  raw: unknown,
): Settings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Settings = { ...defaults };
  for (const spec of specs) {
    const v = src[spec.key];
    if (v === undefined) continue;
    if (
      spec.kind === 'choice' &&
      typeof v === 'string' &&
      spec.options.some((o) => o.value === v)
    ) {
      out[spec.key] = v;
    } else if (spec.kind === 'number' && typeof v === 'number' && Number.isFinite(v)) {
      out[spec.key] = Math.max(spec.min, Math.min(spec.max, Math.round(v)));
    } else if (spec.kind === 'boolean' && typeof v === 'boolean') {
      out[spec.key] = v;
    }
  }
  return out;
}

function isOpCall(def: AnyVizDef, x: unknown): x is OpCall {
  if (!Array.isArray(x) || typeof x[0] !== 'string') return false;
  const spec = def.ops[x[0]];
  if (!spec || x.length - 1 !== spec.arity) return false;
  return x
    .slice(1)
    .every((a) => (typeof a === 'number' && Number.isFinite(a)) || typeof a === 'string');
}

/** Check an untrusted example (from a link or a file) against a visualization. */
export function validateExample(def: AnyVizDef, raw: unknown): SavedExample {
  if (!raw || typeof raw !== 'object') throw new ExampleError('This is not an example file.');
  const x = raw as Record<string, unknown>;
  if (x.format !== 1)
    throw new ExampleError('This example was made by a newer version of the site.');
  if (x.viz !== def.id)
    throw new ExampleError(`This example is for "${String(x.viz)}", not ${def.id}.`);
  if (!Array.isArray(x.ops)) throw new ExampleError('The example has no list of operations.');
  if (x.ops.length > 2000) throw new ExampleError('The example has too many operations.');
  const bad = x.ops.findIndex((op) => !isOpCall(def, op));
  if (bad >= 0) throw new ExampleError(`Operation ${bad + 1} in the example is not valid here.`);
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const at =
    x.at && typeof x.at === 'object'
      ? {
          op: Number((x.at as Record<string, unknown>).op) || 0,
          step: Number((x.at as Record<string, unknown>).step) || 0,
        }
      : undefined;
  return {
    format: 1,
    viz: def.id,
    id: str(x.id, 80),
    title: str(x.title, 200),
    notes: str(x.notes, 2000),
    settings: normalizeSettings(def.settings, def.defaults, x.settings),
    seed: typeof x.seed === 'number' && Number.isFinite(x.seed) ? x.seed >>> 0 : 1,
    ops: x.ops as OpCall[],
    at,
  };
}

/** Read just the visualization id from an untrusted example, to route it. */
export function exampleViz(raw: unknown): string | null {
  return raw && typeof raw === 'object' && typeof (raw as { viz?: unknown }).viz === 'string'
    ? (raw as { viz: string }).viz
    : null;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const hasCompression = () => typeof CompressionStream !== 'undefined';

/**
 * Encode an example for a URL. "z" + deflate-raw + base64url when the browser can compress,
 * otherwise "j" + base64url of the JSON.
 */
export async function encodeExample(ex: SavedExample): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(ex));
  if (hasCompression()) {
    return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  }
  return 'j' + toBase64Url(json);
}

/** Decode an example from a URL. The result is untrusted: run it through validateExample. */
export async function decodeExample(code: string): Promise<unknown> {
  const kind = code[0];
  if (kind !== 'z' && kind !== 'j') throw new ExampleError(BAD_LINK);
  try {
    const bytes = fromBase64Url(code.slice(1));
    const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    // Browsers report corrupt data in their own words ("Failed to fetch" in Chrome).
    throw new ExampleError(BAD_LINK);
  }
}

export function makeExample(
  viz: string,
  settings: Settings,
  seed: number,
  ops: OpCall[],
  at?: { op: number; step: number },
  meta: { title?: string; notes?: string } = {},
): SavedExample {
  const clean: Record<string, Scalar> = { ...settings };
  return { format: 1, viz, ...meta, settings: clean, seed, ops, at };
}
