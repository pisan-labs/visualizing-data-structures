"""A linear-bounded automaton: a Turing machine confined to its input between < and >.

A machine maps (state, symbol) to (next state, symbol to write, "L" or "R"). The head may read
the markers < and > but never overwrite them or move past them.
"""


def table(text):
    """Rules written "q0 a q1 x R; ...": state, read, next state, write, move."""
    rules = {}
    for item in text.split(";"):
        q, a, p, b, d = item.split()
        rules[q, a] = (p, b, d)
    return rules


# a^n b^n c^n: cross off one a, b and c per pass, then check only y's and z's are left.
ANBNCN = table(
    "q0 a q1 x R; q0 y q4 y R; q0 > accept > L; q1 a q1 a R; q1 y q1 y R; q1 b q2 y R;"
    "q2 b q2 b R; q2 z q2 z R; q2 c q3 z L; q3 a q3 a L; q3 b q3 b L; q3 y q3 y L;"
    "q3 z q3 z L; q3 x q0 x R; q4 y q4 y R; q4 z q5 z R; q5 z q5 z R; q5 > accept > L"
)
# a^(2^k): cross off every other a on each pass (Sipser's M2), inside the markers.
POWER2 = table(
    "q1 a q2 y R; q2 x q2 x R; q2 a q3 x R; q2 > accept > L; q3 x q3 x R; q3 a q4 a R;"
    "q3 > q5 > L; q4 x q4 x R; q4 a q3 x R; q5 a q5 a L; q5 x q5 x L; q5 y q2 y R"
)
# Doubling: wants to write a copy after the input, so it runs into the right marker.
DOUBLE = table("q0 a q1 x R; q0 > accept > L; q1 a q1 a R; q1 x q1 x R; q1 > q1 > R")


def run(rules, start, word, cap=1000):
    """Returns ("accept" | "reject" | "blocked", moves)."""
    tape, head, q, moves = ["<", *word, ">"], 1, start, 0
    while moves < cap:
        a = tape[head]
        if (q, a) not in rules:
            return "reject", moves
        p, b, d = rules[q, a]
        if (a == "<" and d == "L") or (a == ">" and d == "R") or (a in "<>" and b != a):
            return "blocked", moves  # the head may not leave the input
        tape[head] = b
        head += 1 if d == "R" else -1
        q, moves = p, moves + 1
        if q in ("accept", "reject"):
            return q, moves
    return "reject", moves
