/**
 * Two dictionary compressors, chosen by a setting.
 *
 * LZ77 (Ziv and Lempel, 1977) slides a window over the text. At each position it finds the
 * longest match between the lookahead (the next characters) and a string starting in the window
 * (the last W characters), and writes a triple (offset, length, next): go back offset, copy
 * length characters, then add next. A match may run into the lookahead, so (1, 5, b) after an a
 * writes aaaaab. Decoding copies one character at a time.
 *
 * LZW (Welch, 1984, after Ziv and Lempel's 1978 scheme) grows a dictionary instead. It starts
 * with every single byte (codes 0 to 255), reads the longest string w already in the dictionary,
 * writes w's code and adds w plus the next character as a new code. The decoder rebuilds the same
 * dictionary from the codes, one step behind, with one tricky case: a code it has not made yet
 * must be w + w[0].
 *
 * The compression ratio counts bits: 8 per input character; for LZ77, offset and length bits
 * (enough for W and the lookahead) plus 8 for next; for LZW, 9 bits per code, enough for 512.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Cmp } from '../../layouts/align';
import { L, plural, q } from '../_strings/kit';

export interface LzSettings {
  [key: string]: Scalar;
  method: 'lz77' | 'lzw';
  /** LZ77: how far back a match may start. */
  window: number;
  /** LZ77: the longest match. */
  lookahead: number;
}

export const defaults: LzSettings = { method: 'lz77', window: 8, lookahead: 6 };

export const MAX_TEXT = 20;
/** Bits per LZW code: codes up to 511. */
export const LZW_BITS = 9;

export interface Triple {
  off: number;
  len: number;
  next: string;
  /** Where in the text it starts. */
  at: number;
}

export interface Code {
  code: number;
  str: string;
  at: number;
}

export interface LzState {
  text: string;
  phase: 'none' | 'encode' | 'decode';
  /** Characters encoded so far. */
  pos: number;
  triples: Triple[];
  codes: Code[];
  /** LZW entries made so far, 256 up. */
  dict: Code[];
  encoded: boolean;
  /** Decoder output, and tokens decoded. */
  out: string;
  dk: number;
  decoded: boolean;
}

/** The comparison row: `src` copied under `dst`, or the phrase w under its place. */
export interface LzRow {
  /** Column of the first cell. */
  dst: number;
  /** Text index drawn there (dst − offset for a copy). */
  src: number;
  cells: (Cmp | null)[];
  label: string;
}

export interface LzExtra {
  row?: LzRow;
  /** A copy's source and where it goes, for the screen-reader label. */
  copy?: { from: number; to: number };
}

export type LzStep = Step<LzState, LzExtra>;
type Op = OpSpec<LzState, LzSettings, LzExtra>;

export const START = 'abababcababc';

export const tokId = (k: number) => `tok-${k}`;
export const dictId = (code: number) => `dict-${code}`;
export const textId = (i: number) => `t-${i}`;

function fresh(text: string): LzState {
  return {
    text,
    phase: 'none',
    pos: 0,
    triples: [],
    codes: [],
    dict: [],
    encoded: false,
    out: '',
    dk: 0,
    decoded: false,
  };
}

export const init = (): LzState => fresh(START);

const bitsFor = (k: number) => Math.max(1, Math.ceil(Math.log2(k + 1)));

/** Bits per LZ77 triple: offset 0..W, length 0..lookahead, and one byte. */
export const tripleBits = (s: LzSettings) => bitsFor(s.window) + bitsFor(s.lookahead) + 8;

export function outBits(st: LzState, s: LzSettings): number {
  return s.method === 'lz77' ? st.triples.length * tripleBits(s) : st.codes.length * LZW_BITS;
}

export const tripleText = (t: Triple) => `(${t.off},${t.len},${t.next})`;

// ----- Reference encoders (also used to plan the frame) -----

/** LZ77: longest match in the window, nearest on ties, always leaving a next character. */
export function lz77(text: string, s: LzSettings): Triple[] {
  const out: Triple[] = [];
  let pos = 0;
  while (pos < text.length) {
    const max = Math.min(s.lookahead, text.length - pos - 1);
    let best = { off: 0, len: 0 };
    for (let d = 1; d <= Math.min(s.window, pos); d++) {
      let k = 0;
      while (k < max && text[pos - d + k] === text[pos + k]) k++;
      if (k > best.len) best = { off: d, len: k };
    }
    out.push({ ...best, next: text[pos + best.len]!, at: pos });
    pos += best.len + 1;
  }
  return out;
}

export function lzw(text: string): { codes: Code[]; dict: Code[] } {
  const dict = new Map<string, number>();
  const made: Code[] = [];
  const codes: Code[] = [];
  const codeOf = (w: string) => (w.length === 1 ? w.charCodeAt(0) : dict.get(w)!);
  const has = (w: string) => w.length === 1 || dict.has(w);
  let w = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (has(w + c)) w += c;
    else {
      codes.push({ code: codeOf(w), str: w, at: start });
      const code = 256 + made.length;
      dict.set(w + c, code);
      made.push({ code, str: w + c, at: start });
      w = c;
      start = i;
    }
  }
  if (w) codes.push({ code: codeOf(w), str: w, at: start });
  return { codes, dict: made };
}

// ----- Input -----

export function parseText(raw: Value | undefined): string | { error: string } {
  const t = String(raw ?? '').trim();
  if (!t) return { error: 'Type a text, such as abababcababc.' };
  if (/\s/.test(t))
    return { error: 'Type the text with no spaces, so every character is one cell.' };
  const bad = /[^A-Za-z0-9]/.exec(t);
  if (bad) return { error: `"${t}" has "${bad[0]}" in it. Use letters and digits only.` };
  if (t.length > MAX_TEXT)
    return { error: `That text has ${t.length} characters. Keep it to ${MAX_TEXT}.` };
  return t;
}

export function parseInput(token: string): Value | Error {
  const r = parseText(token);
  return typeof r === 'string' ? r : new Error(r.error);
}

// ----- Steps -----

const mk = (id: string, role: Mark['role']): Mark => ({ id, role });

function vars(
  st: LzState,
  s: LzSettings,
  more: Record<string, Scalar> = {},
): Record<string, Scalar> {
  const tokens = s.method === 'lz77' ? st.triples.length : st.codes.length;
  const inBits = 8 * st.pos;
  const out = outBits(st, s);
  const v: Record<string, Scalar> = { ...more, tokens, 'bits in': inBits, 'bits out': out };
  if (inBits > 0) v.ratio = `${Math.round((100 * out) / inBits)}%`;
  if (s.method === 'lzw') v['dictionary size'] = 256 + st.dict.length;
  return v;
}

function step(
  st: LzState,
  s: LzSettings,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[] = [],
  more: Record<string, Scalar> = {},
  extra?: LzExtra,
): LzStep {
  return {
    state: structuredClone(st),
    marks,
    say,
    lines,
    level,
    vars: vars(st, s, more),
    ...(extra ? { extra } : {}),
  };
}

function* encode77(st: LzState, s: LzSettings): Generator<LzStep, void, void> {
  const text = st.text;
  const n = text.length;
  yield step(
    st,
    s,
    `LZ77 with a window of ${s.window} and a lookahead of ${s.lookahead}. Each triple (offset, length, next) says: go back offset, copy length characters, then add next. A triple costs ${tripleBits(s)} bits here.`,
    ['sig'],
    2,
  );
  while (st.pos < n) {
    const pos = st.pos;
    const max = Math.min(s.lookahead, n - pos - 1);
    const lo = Math.max(0, pos - s.window);
    let best = { off: 0, len: 0 };
    for (let d = 1; d <= Math.min(s.window, pos); d++) {
      let k = 0;
      const cells: (Cmp | null)[] = [];
      while (k < max && text[pos - d + k] === text[pos + k]) {
        cells.push('match');
        k++;
      }
      if (k < max) cells.push('mismatch');
      const better = k > best.len;
      if (better) best = { off: d, len: k };
      yield step(
        st,
        s,
        k
          ? `Offset ${d}: ${q(text.slice(pos - d, pos - d + k))} matches ${plural(k, 'character')}${k === max ? ', as many as allowed' : ''}.${better ? ' The longest so far.' : ''}`
          : `Offset ${d}: T[${pos - d}] = ${q(text[pos - d]!)} does not match T[${pos}] = ${q(text[pos]!)}.`,
        ['try', 'cmp'],
        3,
        [mk(textId(pos - d), 'compare')],
        { pos, offset: d, length: k },
        { row: { dst: pos, src: pos - d, cells, label: `−${d}` } },
      );
    }
    const t: Triple = { ...best, next: text[pos + best.len]!, at: pos };
    st.triples.push(t);
    st.pos = pos + best.len + 1;
    const where =
      pos === 0
        ? 'The window is empty, so nothing can match.'
        : best.len === 0
          ? `Nothing in the window T[${lo}..${pos - 1}] starts with ${q(text[pos]!)}.`
          : `The longest match is ${q(text.slice(pos, pos + best.len))}, ${best.off} back${best.off < best.len ? ': it runs into the lookahead, which is fine because the decoder copies one character at a time' : ''}.`;
    yield step(
      st,
      s,
      `${where} Write ${tripleText(t)} and move ${plural(best.len + 1, 'character')} on.`,
      ['emit', 'move'],
      2,
      [mk(tokId(st.triples.length - 1), 'new')],
      { pos },
      best.len
        ? {
            row: {
              dst: pos,
              src: pos - best.off,
              cells: Array.from({ length: best.len }, () => 'match' as Cmp),
              label: `−${best.off}`,
            },
            copy: { from: pos - best.off, to: pos },
          }
        : undefined,
    );
  }
}

function* encodeW(st: LzState, s: LzSettings): Generator<LzStep, void, void> {
  const text = st.text;
  const dict = new Map<string, number>();
  const codeOf = (w: string) => (w.length === 1 ? w.charCodeAt(0) : dict.get(w)!);
  const has = (w: string) => w.length === 1 || dict.has(w);
  yield step(
    st,
    s,
    `LZW starts with every single byte in the dictionary: codes 0 to 255 (a = 97, b = 98…). New strings get codes from 256. Each code costs ${LZW_BITS} bits.`,
    ['sig', 'init'],
    2,
  );
  let w = '';
  let start = 0;
  const row = (end: number, last?: Cmp): LzRow => ({
    dst: start,
    src: start,
    cells: Array.from({ length: end - start }, (_, j) =>
      j === end - start - 1 && last ? last : 'match',
    ),
    label: 'w',
  });
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (has(w + c)) {
      w += c;
      st.pos = start;
      yield step(
        st,
        s,
        w.length === 1
          ? `Read ${q(c)}: w = ${q(w)}, a single byte, always in the dictionary.`
          : `Read ${q(c)}: ${q(w)} is in the dictionary (code ${codeOf(w)}), so keep reading.`,
        ['read', 'in', 'grow'],
        3,
        [mk(textId(i), 'compare')],
        { w },
        { row: row(i + 1) },
      );
      continue;
    }
    const code = codeOf(w);
    st.codes.push({ code, str: w, at: start });
    const fresh = 256 + st.dict.length;
    dict.set(w + c, fresh);
    st.dict.push({ code: fresh, str: w + c, at: start });
    st.pos = i;
    yield step(
      st,
      s,
      `Read ${q(c)}: ${q(w + c)} is not in the dictionary. Write the code for ${q(w)}, ${code}, and add ${q(w + c)} as code ${fresh}. Start again from ${q(c)}.`,
      ['read', 'in', 'out', 'add', 'reset'],
      2,
      [mk(tokId(st.codes.length - 1), 'new'), mk(dictId(fresh), 'new')],
      { w: c },
      { row: row(i + 1, 'mismatch') },
    );
    w = c;
    start = i;
  }
  if (w) {
    st.codes.push({ code: codeOf(w), str: w, at: start });
    st.pos = text.length;
    yield step(
      st,
      s,
      `The text ends. Write the code for what is left, ${q(w)}: ${codeOf(w)}.`,
      ['last'],
      2,
      [mk(tokId(st.codes.length - 1), 'new')],
      { w },
      { row: row(text.length) },
    );
  }
}

function ratioText(st: LzState, s: LzSettings): string {
  const inBits = 8 * st.text.length;
  const out = outBits(st, s);
  const pct = Math.round((100 * out) / inBits);
  return `${out} bits for ${inBits} bits of input: ${pct}%${pct < 100 ? `, a saving of ${100 - pct}%` : pct > 100 ? '. Bigger than the input: short texts rarely compress' : ''}`;
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const t = parseText(arg);
    if (typeof t !== 'string') {
      yield step(s, settings, `Nothing loaded. ${t.error}`, [], 1, [mk('t-name', 'error')]);
      return s;
    }
    const st = fresh(t);
    yield step(
      st,
      settings,
      `The text is ${q(t)}, ${plural(t.length, 'character')}, ${8 * t.length} bits as bytes. Press Encode.`,
      [],
      1,
    );
    return st;
  },
};

const encode: Op = {
  label: 'Encode',
  arity: 0,
  *run(s, _a, { settings }) {
    const st = fresh(s.text);
    st.phase = 'encode';
    if (settings.method === 'lz77') yield* encode77(st, settings);
    else yield* encodeW(st, settings);
    st.encoded = true;
    const list =
      settings.method === 'lz77'
        ? st.triples.map(tripleText).join(' ')
        : st.codes.map((c) => c.code).join(' ');
    yield step(
      st,
      settings,
      `Done. ${settings.method === 'lz77' ? plural(st.triples.length, 'triple') : plural(st.codes.length, 'code')}: ${list}. That is ${ratioText(st, settings)}.`,
      ['ret'],
      1,
    );
    return st;
  },
};

function* decode77(st: LzState, s: LzSettings): Generator<LzStep, void, void> {
  yield step(
    st,
    s,
    'Decode: read the triples in order. Each copies from what is already written, then adds one character.',
    ['d.sig'],
    2,
  );
  for (let k = 0; k < st.triples.length; k++) {
    const t = st.triples[k]!;
    const start = st.out.length;
    for (let j = 0; j < t.len; j++) {
      const from = start + j - t.off;
      st.out += st.out[from]!;
      yield step(
        st,
        s,
        `${tripleText(t)}: copy T[${from}] = ${q(st.out[from]!)} to T[${start + j}].${from >= start ? ' It was written by this same triple a moment ago.' : ''}`,
        ['d.copy'],
        3,
        [mk(tokId(k), 'active'), mk(textId(from), 'compare'), mk(textId(start + j), 'new')],
        {},
        {
          row: {
            dst: start,
            src: start - t.off,
            cells: Array.from({ length: j + 1 }, () => 'match' as Cmp),
            label: `−${t.off}`,
          },
          copy: { from, to: start + j },
        },
      );
    }
    st.out += t.next;
    st.dk = k + 1;
    yield step(
      st,
      s,
      `${tripleText(t)}: ${t.len ? `copied ${plural(t.len, 'character')} from ${t.off} back, then add` : 'nothing to copy; add'} ${q(t.next)}. The text so far: ${q(st.out)}.`,
      ['d.copy', 'd.next'],
      2,
      [mk(tokId(k), 'done'), mk(textId(st.out.length - 1), 'new')],
    );
  }
}

function* decodeW(st: LzState, s: LzSettings): Generator<LzStep, void, void> {
  const dict = new Map<number, string>();
  const strOf = (code: number) => (code < 256 ? String.fromCharCode(code) : dict.get(code));
  const decodedDict: Code[] = [];
  st.dict = [];
  yield step(
    st,
    s,
    'Decode: start from the same 256 single bytes. Each code adds the previous string plus the first character of this one, so the dictionary is rebuilt one step behind the encoder.',
    ['d.sig', 'd.init'],
    2,
  );
  let prev: string | null = null;
  for (let k = 0; k < st.codes.length; k++) {
    const code = st.codes[k]!.code;
    let cur = strOf(code);
    let tricky = false;
    if (cur === undefined) {
      cur = prev! + prev![0]!;
      tricky = true;
    }
    let added = '';
    if (prev !== null) {
      const fresh = 256 + decodedDict.length;
      dict.set(fresh, prev + cur[0]!);
      decodedDict.push({ code: fresh, str: prev + cur[0]!, at: st.out.length - prev.length });
      st.dict = decodedDict.map((d) => ({ ...d }));
      added = ` Add ${q(prev + cur[0]!)} as code ${fresh}.`;
    }
    st.out += cur;
    st.dk = k + 1;
    const say = tricky
      ? `Code ${code} is not in the dictionary yet: the encoder made it on the step it wrote it. That only happens when it is the previous string plus its own first character, ${q(cur)}.${added}`
      : `Code ${code} is ${q(cur)}: write it.${added}`;
    yield step(
      st,
      s,
      `${say} The text so far: ${q(st.out)}.`,
      tricky ? ['d.read', 'd.tricky', 'd.add', 'd.out'] : ['d.read', 'd.look', 'd.add', 'd.out'],
      2,
      [
        mk(tokId(k), 'done'),
        ...(prev !== null ? [mk(dictId(256 + decodedDict.length - 1), 'new')] : []),
      ],
    );
    prev = cur;
  }
}

const decode: Op = {
  label: 'Decode',
  arity: 0,
  *run(s, _a, { settings }) {
    let st = structuredClone(s);
    if (!st.encoded) {
      st = fresh(s.text);
      st.pos = st.text.length;
      if (settings.method === 'lz77') st.triples = lz77(st.text, settings);
      else st.codes = lzw(st.text).codes;
      st.encoded = true;
    }
    st.phase = 'decode';
    st.out = '';
    st.dk = 0;
    if (settings.method === 'lz77') yield* decode77(st, settings);
    else yield* decodeW(st, settings);
    st.decoded = true;
    yield step(
      st,
      settings,
      `Done. The decoder rebuilt ${q(st.out)}${st.out === st.text ? ', exactly the text that was encoded' : ''}. It never needed the text, only the ${settings.method === 'lz77' ? 'triples' : 'codes'}.`,
      ['d.ret'],
      1,
      [...st.out].map((_, i) => mk(textId(i), 'found')),
    );
    return st;
  },
};

export const ops: Record<string, Op> = { load, encode, decode };

export function pseudocode(settings: LzSettings): PseudoBlock[] {
  if (settings.method === 'lz77') {
    const enc = [
      L(
        'sig',
        0,
        `lz77(T, W = ${settings.window}, A = ${settings.lookahead})`,
        'To compress T with a sliding window:',
      ),
      L('loop', 1, 'pos = 0; while pos < n', 'Until the whole text is written,'),
      L('try', 2, 'for d = 1 to min(W, pos)', 'try every start in the window,'),
      L(
        'cmp',
        3,
        'k = longest with T[pos − d + k] == T[pos + k], k < A',
        'and see how far it matches the lookahead.',
      ),
      L(
        'emit',
        2,
        'write (best d, best k, T[pos + k])',
        'Write the longest match and the character after it.',
      ),
      L('move', 2, 'pos = pos + k + 1', 'Move past them.'),
      L('ret', 1, 'return the triples', 'That is the compressed text.'),
    ];
    const dec = [
      L('d.sig', 0, 'unlz77(triples)', 'To decompress:'),
      L(
        'd.copy',
        1,
        'for (d, k, c): repeat k times: out += out[len(out) − d]',
        'copy k characters from d back, one at a time,',
      ),
      L('d.next', 2, 'out += c', 'then add the next character.'),
      L('d.ret', 1, 'return out', 'The text is back.'),
    ];
    return [
      { op: 'encode', lines: enc },
      { op: 'decode', lines: dec },
    ];
  }
  const enc = [
    L('sig', 0, 'lzw(T)', 'To compress T with a growing dictionary:'),
    L(
      'init',
      1,
      'dict = every single byte, codes 0..255; w = ""',
      'Start with every single character.',
    ),
    L('read', 1, 'for each character c of T', 'Read the text one character at a time.'),
    L('in', 2, 'if w + c is in dict', 'If the string so far plus c is known,'),
    L('grow', 3, 'w = w + c', 'keep reading.'),
    L('out', 2, 'else write dict[w]', 'Otherwise write the code for w,'),
    L('add', 3, 'add w + c with the next code', 'learn w + c,'),
    L('reset', 3, 'w = c', 'and start again from c.'),
    L('last', 1, 'write dict[w]', 'At the end, write the code for what is left.'),
    L('ret', 1, 'return the codes', 'That is the compressed text.'),
  ];
  const dec = [
    L('d.sig', 0, 'unlzw(codes)', 'To decompress:'),
    L(
      'd.init',
      1,
      'dict = every single byte; prev = none',
      'Start with the same single characters.',
    ),
    L('d.read', 1, 'for each code', 'For each code,'),
    L('d.look', 2, 'cur = dict[code]', 'look it up;'),
    L(
      'd.tricky',
      2,
      'if code is not in dict: cur = prev + prev[0]',
      'a code not made yet is the previous string plus its own first character.',
    ),
    L(
      'd.add',
      2,
      'if prev: add prev + cur[0]',
      'Learn the string the encoder learned one step earlier,',
    ),
    L('d.out', 2, 'out += cur; prev = cur', 'and write cur.'),
    L('d.ret', 1, 'return out', 'The text is back.'),
  ];
  return [
    { op: 'encode', lines: enc },
    { op: 'decode', lines: dec },
  ];
}

export function initialSay(st: LzState, settings: LzSettings): string {
  return `The text is ${q(st.text)}. ${settings.method === 'lz77' ? 'LZ77 replaces repeats with pointers back into a sliding window.' : 'LZW replaces repeats with codes from a dictionary it builds as it goes.'} Press Encode, then Decode.`;
}

export const initialVars = (st: LzState) => ({ n: st.text.length, 'bits in': 8 * st.text.length });

export function describe(st: LzState, settings: LzSettings): string {
  const head = `Text ${st.text}.`;
  const tokens =
    settings.method === 'lz77'
      ? st.triples.length
        ? ` Triples: ${st.triples.map(tripleText).join(' ')}.`
        : ''
      : st.codes.length
        ? ` Codes: ${st.codes.map((c) => c.code).join(' ')}.${st.dict.length ? ` Dictionary: ${st.dict.map((d) => `${d.code} ${d.str}`).join(', ')}.` : ''}`
        : '';
  const out = st.phase === 'decode' ? ` Decoded so far: ${st.out || 'nothing'}.` : '';
  return head + tokens + out;
}
