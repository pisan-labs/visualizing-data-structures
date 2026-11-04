import { Timeline, type Entry } from '../../engine/timeline';
import type { OpCall, Settings, Value, VizDef } from '../../engine/types';

/**
 * Driver protocol shared by the singly and doubly linked list code tabs: one operation per
 * line ("insertAt 2 42"), then "print". Results:
 * - insertHead, insertTail, reverse: ok; insertAt: ok | index error
 * - removeHead, removeTail: the value | empty
 * - removeAt, get: the value | index error
 * - removeValue: true | false; search: the index or -1
 * - print: the values from front to back, or "empty"
 */
export function listScript<S, Set extends Settings, X>(
  def: VizDef<S, Set, X>,
  calls: OpCall[],
  settings: Set,
  values: (s: S) => Value[],
): { input: string[]; expected: string[] } {
  const usable = calls.filter(runnable);
  const t = new Timeline(def, settings, 1, usable);
  const input = [...usable.map((c) => c.join(' ')), 'print'];
  const expected = [...t.entries.map(result), values(t.endState()).join(' ') || 'empty'];
  return { input, expected };
}

const isIndex = (v: Value | undefined) => typeof v === 'number' && Number.isInteger(v);

/** Calls the typed code can take: an index must be a whole number (an int in Java and C++). */
function runnable([op, a, b]: OpCall): boolean {
  if (op === 'insertAt') return isIndex(a) && b !== undefined;
  if (op === 'removeAt' || op === 'get') return isIndex(a);
  return true;
}

/** The driver's line for one operation, read off the model's last step. */
function result<S, X>(e: Entry<S, X>): string {
  const last = e.steps[e.steps.length - 1]!;
  const failed = last.lines.some((l) => l.endsWith('.error'));
  const returned = String(last.vars?.returned);
  switch (e.call[0]) {
    case 'insertAt':
      return failed ? 'index error' : 'ok';
    case 'removeHead':
    case 'removeTail':
      return failed ? 'empty' : returned;
    case 'removeAt':
    case 'get':
      return failed ? 'index error' : returned;
    case 'removeValue':
    case 'search':
      return returned;
    default:
      return 'ok';
  }
}
