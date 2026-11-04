import type { AnyVizDef, ControlButton, OpCall, Value } from './types';

/**
 * Typed operation scripts: one statement per line or separated by ";".
 * A statement is an operation (its name or its button label) followed by values, for example
 * "push 10 20" (one call per value for bulk operations), "insert 2 99" (an operation that takes
 * two values) or "pop". Lines starting with "#" are comments.
 */
export type ScriptResult = { calls: OpCall[] } | { error: string };

function findButton(def: AnyVizDef, word: string): ControlButton | undefined {
  const w = word.toLowerCase();
  return def.controls.buttons.find((b) => b.op.toLowerCase() === w || b.label.toLowerCase() === w);
}

export function parseScript(def: AnyVizDef, text: string): ScriptResult {
  const calls: OpCall[] = [];
  const statements = text
    .split('\n')
    .flatMap((line, i) => line.split(';').map((s) => ({ s: s.trim(), line: i + 1 })))
    .filter(({ s }) => s && !s.startsWith('#'));
  if (statements.length === 0) return { error: 'The script is empty.' };
  for (const { s, line } of statements) {
    const [word = '', ...tokens] = s.split(/[\s,]+/).filter(Boolean);
    const b = findButton(def, word);
    const where = `Line ${line}`;
    if (!b) {
      const names = def.controls.buttons.map((x) => x.op).join(', ');
      return { error: `${where}: "${word}" is not an operation here. Try one of: ${names}.` };
    }
    const arity = def.ops[b.op]?.arity ?? 0;
    if (arity === 0) {
      if (tokens.length) return { error: `${where}: ${b.op} takes no values.` };
      calls.push([b.op]);
      continue;
    }
    if (!def.controls.input) return { error: `${where}: ${b.op} needs a value.` };
    if (tokens.length === 0) return { error: `${where}: ${b.op} needs a value.` };
    const values: Value[] = [];
    for (const t of tokens) {
      const v = def.controls.input.parse(t);
      if (v instanceof Error) return { error: `${where}: "${t}": ${v.message}` };
      values.push(v);
    }
    if (arity === 1 && (b.bulk || values.length === 1)) {
      for (const v of values) calls.push([b.op, v]);
    } else if (values.length % arity === 0) {
      for (let k = 0; k < values.length; k += arity)
        calls.push([b.op, ...values.slice(k, k + arity)]);
    } else {
      return { error: `${where}: ${b.op} takes ${arity} values at a time.` };
    }
    if (calls.length > 500) return { error: 'Scripts are limited to 500 operations.' };
  }
  return { calls };
}

/** The inverse: write a list of operations as a script, one per line. */
export function toScript(calls: OpCall[]): string {
  return calls.map(([op, ...args]) => [op, ...args.map(String)].join(' ')).join('\n');
}
