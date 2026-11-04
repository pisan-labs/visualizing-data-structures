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
import { vizzes } from './registry';

type Lang = 'python' | 'java' | 'cpp';

const available = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;

const toolchain: Record<Lang, boolean> = {
  python: available('python3', ['--version']),
  java: available('javac', ['-version']) && available('java', ['-version']),
  cpp: available('g++', ['--version']),
};

/** Values the random scripts may use: small integers and letters this page accepts. */
function valuePool(def: AnyVizDef): Value[] {
  const parse = def.controls.input?.parse;
  const candidates = [
    ...Array.from({ length: 60 }, (_, i) => String(i)),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ];
  if (!parse) return [];
  return candidates.map((c) => parse(c)).filter((v): v is Value => !(v instanceof Error));
}

function randomScript(def: AnyVizDef, seed: number, length: number): OpCall[] {
  const rng = makeRng(seed);
  const pool = valuePool(def);
  const buttons = def.controls.buttons.filter((b) => !b.usesInput || pool.length > 0);
  return Array.from({ length }, () => {
    const b = buttons[rng.int(0, buttons.length - 1)]!;
    if (!b.usesInput) return [b.op] as OpCall;
    const args = Array.from({ length: b.args ?? 1 }, () => pool[rng.int(0, pool.length - 1)]!);
    return [b.op, ...args] as OpCall;
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
      runners.python = (input) => run('python3', ['main.py'], dir, input);
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
