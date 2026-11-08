/**
 * Runs the static code behind every page's Python, Java and C++ tabs and checks that it
 * behaves exactly like the visualization's own model. Scripts come from the curated examples
 * plus seeded random operations. Each language needs its toolchain (python3, javac/java, g++);
 * CI has all three. Locally, a missing toolchain skips that language.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeRng } from '../engine/rng';
import type { AnyVizDef, OpCall, Settings, Value } from '../engine/types';
import { vizzes } from './all';

type Lang = 'python' | 'java' | 'cpp';

const available = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;

const toolchain: Record<Lang, boolean> = {
  python: available('python3', ['--version']),
  java: available('javac', ['-version']) && available('java', ['-version']),
  cpp: available('g++', ['--version']),
};

/**
 * Values the random scripts may use: small integers, letters, and words that share prefixes (so
 * word pages see an insert split a compressed-trie edge), whichever this page accepts.
 */
const WORDS =
  'an and ant any be bee beat bed car card care cart do dog dot ten tea team tear'.split(' ');

function valuePool(def: AnyVizDef): Value[] {
  const parse = def.controls.input?.parse;
  const candidates = [
    ...Array.from({ length: 60 }, (_, i) => String(i)),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
    ...WORDS,
  ];
  if (!parse) return [];
  return candidates.map((c) => parse(c)).filter((v): v is Value => !(v instanceof Error));
}

/**
 * A random script for a page whose input is not a single value (a statement, a recurrence, a
 * graph): the page's own random and preset generators, mixed with its other buttons.
 */
function generatedScript(def: AnyVizDef, seed: number, chunks: number): OpCall[] {
  const rng = makeRng(seed);
  const { random, presets = [], sizes = [5, 8, 12], buttons } = def.controls;
  const makers = [
    ...(random ? [(r: typeof rng) => random.make(r)] : []),
    ...presets.map((p) => (r: typeof rng) => p.make(r, sizes[r.int(0, sizes.length - 1)] ?? 5)),
  ];
  const plain = buttons.filter((b) => !b.usesInput);
  return Array.from({ length: chunks }, () =>
    plain.length > 0 && rng.int(0, 2) === 0
      ? [[plain[rng.int(0, plain.length - 1)]!.op] as OpCall]
      : makers[rng.int(0, makers.length - 1)]!(rng),
  ).flat();
}

function randomScript(def: AnyVizDef, seed: number, length: number): OpCall[] {
  const rng = makeRng(seed);
  const pool = valuePool(def);
  const generators = Boolean(def.controls.random) || (def.controls.presets?.length ?? 0) > 0;
  if (pool.length === 0 && generators && def.controls.buttons.some((b) => b.usesInput))
    return generatedScript(def, seed, Math.ceil(length / 6));
  const buttons = def.controls.buttons.filter((b) => !b.usesInput || pool.length > 0);
  return Array.from({ length }, () => {
    const b = buttons[rng.int(0, buttons.length - 1)]!;
    if (!b.usesInput) return [b.op] as OpCall;
    const values = Array.from(
      { length: b.args?.length ?? 1 },
      () => pool[rng.int(0, pool.length - 1)]!,
    );
    return [b.op, ...values] as OpCall;
  });
}

function scripts(def: AnyVizDef): { name: string; calls: OpCall[]; settings: Settings }[] {
  const fromExamples = def.examples.map((ex) => ({
    name: `example "${ex.id}"`,
    calls: ex.ops,
    settings: { ...def.defaults, ...ex.settings },
  }));
  const random = [11, 22, 33].map((seed) => ({
    name: `random script ${seed}`,
    calls: randomScript(def, seed, 60),
    settings: { ...def.defaults },
  }));
  return [...fromExamples, ...random];
}

function run(cmd: string, args: string[], cwd: string, input?: string) {
  const r = spawnSync(cmd, args, { cwd, input, encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}):\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

const withCode = vizzes.filter((v) => v.code);

describe.each(withCode.map((v) => [v.id, v] as const))('%s code tabs', (id, def) => {
  const root = path.resolve('src/viz', id, 'code');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `stepwise-${id}-`));
  const runners: Partial<Record<Lang, (input: string) => string>> = {};

  beforeAll(() => {
    if (toolchain.python) {
      const dir = path.join(root, 'python');
      // -B: never write __pycache__ into the source tree.
      runners.python = (input) => run('python3', ['-B', 'main.py'], dir, input);
    }
    if (toolchain.java) {
      const dir = path.join(root, 'java');
      const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.java'));
      run('javac', ['-d', out, ...sources], dir);
      runners.java = (input) => run('java', ['-cp', out, 'Main'], dir, input);
    }
    if (toolchain.cpp) {
      const dir = path.join(root, 'cpp');
      const exe = path.join(out, 'main');
      run('g++', ['-std=c++17', '-O1', '-Wall', '-Wextra', '-Werror', '-o', exe, 'main.cpp'], dir);
      runners.cpp = (input) => run(exe, [], dir, input);
    }
  }, 180_000);

  it('has a driver for every language', () => {
    for (const [lang, file] of [
      ['python', 'main.py'],
      ['java', 'Main.java'],
      ['cpp', 'main.cpp'],
    ] as const) {
      expect(fs.existsSync(path.join(root, lang, file)), `${lang}/${file}`).toBe(true);
    }
  });

  for (const lang of ['python', 'java', 'cpp'] as const) {
    it.skipIf(!toolchain[lang])(
      `${lang} matches the model`,
      () => {
        for (const s of scripts(def)) {
          const { input, expected } = def.code!.script(s.calls, s.settings);
          const actual = runners[lang]!(input.join('\n') + '\n')
            .split('\n')
            .map((l) => l.trimEnd())
            .filter((l, i, all) => l !== '' || i < all.length - 1);
          expect(actual, `${lang}, ${s.name}`).toEqual(expected);
        }
      },
      120_000,
    );
  }
});
