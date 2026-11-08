"""Rice's theorem by reduction from HALT, on toy programs that read their input and never write.

A toy program is a string of instructions: A accept, R reject, > right, < left, Gk goto k,
Ek goto k if the head is past the input, ?ck goto k if the head is on c. Running past the last
line rejects. Such a program halts or repeats a (line, head) pair, so run() always answers;
for real Turing machines no program can.
"""


def parse(code):
    prog, k = [], 0
    while k < len(code):
        c = code[k]
        n = 1 if c in "AR<>" else 2 if c in "GE" else 3
        prog.append(code[k : k + n])
        k += n
    return prog


def run(code, x):
    """Returns "accept", "reject" or "loop"."""
    prog, line, head, seen = parse(code), 1, 0, set()
    while line <= len(prog):
        if (line, head) in seen:
            return "loop"
        seen.add((line, head))
        ins = prog[line - 1]
        if ins in ("A", "R"):
            return "accept" if ins == "A" else "reject"
        if ins == ">":
            head, line = min(len(x), head + 1), line + 1
        elif ins == "<":
            head, line = max(0, head - 1), line + 1
        elif ins[0] == "G":
            line = int(ins[1])
        elif ins[0] == "E":
            line = int(ins[1]) if head == len(x) else line + 1
        else:  # ?ck
            line = int(ins[2]) if head < len(x) and x[head] == ins[1] else line + 1
    return "reject"


def m_prime(m, w, m_p):
    """The program of the proof: on input x, run m on w; if that halts, behave like m_p on x."""
    return lambda x: "loop" if run(m, w) == "loop" else run(m_p, x)


def has_property(machine, test_word):
    """P = "accepts test_word", decided here by running (possible only for toy programs)."""
    return machine(test_word) == "accept"
