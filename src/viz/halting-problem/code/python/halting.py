"""Toy programs that read their input and never write, and the machine D built from them.

A program is a string of instructions, numbered lines from 1:
    A  accept          R  reject
    >  move right      <  move left (the head stays on the end cell, or on cell 0)
    Gk goto k          Ek if the head is past the input, goto k
    ?ck if the head is on the symbol c, goto k
Running past the last line rejects. A program's description is its code.
"""

CAP = 1000


def parse(code):
    """The code as a list of lines (op, symbol, target)."""
    prog = []
    k = 0
    while k < len(code):
        op = code[k]
        if op in "AR<>":
            prog.append((op, None, None))
            k += 1
        elif op in "GE":
            prog.append((op, None, int(code[k + 1])))
            k += 2
        elif op == "?":
            prog.append((op, code[k + 1], int(code[k + 2])))
            k += 3
        else:
            raise ValueError(f"{op!r} at {k} is not an instruction")
    return prog


def run(code, word, cap=CAP):
    """Run a program on a word, one line per step.

    Returns ("accept", steps), ("reject", steps), ("loop", first, again) when the
    configuration before step `again` is the one before step `first`, or ("unknown",).
    The program never writes, so (line, head) is its whole configuration: a repeat
    means it does the same thing again, forever.
    """
    prog = parse(code)
    m = len(word)
    line, head = 1, 0
    seen = {}
    for step in range(1, cap + 1):
        if line > len(prog):
            return ("reject", step - 1)
        if (line, head) in seen:
            return ("loop", seen[(line, head)], step)
        seen[(line, head)] = step
        op, sym, to = prog[line - 1]
        if op == "A":
            return ("accept", step)
        if op == "R":
            return ("reject", step)
        if op == ">":
            head = min(m, head + 1)
        elif op == "<":
            head = max(0, head - 1)
        jump = (
            op == "G"
            or (op == "E" and head == m)
            or (op == "?" and head < m and word[head] == sym)
        )
        line = to if jump else line + 1
    return ("unknown",)


def halts(code, word):
    return run(code, word)[0] in ("accept", "reject")


def accepts(code, word):
    return run(code, word)[0] == "accept"


def d_row(codes, problem="atm"):
    """D's entry on each program's own code: the opposite of what the program does."""
    if problem == "atm":
        return ["rej" if accepts(c, c) else "acc" for c in codes]
    return ["loop" if halts(c, c) else "halt" for c in codes]


def accept_on_halt(code):
    """M': every reject turned into accept, and an accept after the last line
    (running past it rejects too)."""
    out = []
    for op, sym, to in parse(code):
        op = "A" if op == "R" else op
        out.append(op + (sym or "") + (str(to) if to else ""))
    return "".join(out) + "A"


def s_decides_atm(code, word):
    """S from a halting decider: a loop is rejected unrun; anything else is run."""
    if not halts(code, word):
        return "reject"
    return run(code, word)[0]


def r_decides_halt(code, word):
    """R from an acceptance decider: M halts on w exactly when M' accepts w."""
    return "halts" if accepts(accept_on_halt(code), word) else "loops"
