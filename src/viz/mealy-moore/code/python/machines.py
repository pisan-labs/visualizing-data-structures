"""Machines with output. A Moore machine writes on its states, a Mealy
machine on its moves. delta[(q, c)] is where state q goes on symbol c, and
every state has a move on every symbol.
"""


class Moore:
    """out[q] is what state q writes."""

    def __init__(self, states, start, delta, out):
        self.states, self.start, self.delta, self.out = states, start, delta, out

    def run(self, word):
        q = self.start
        written = [self.out[q]]  # before reading anything
        for c in word:
            q = self.delta[(q, c)]
            written.append(self.out[q])
        return "".join(written)


class Mealy:
    """out[(q, c)] is what the move from q on c writes."""

    def __init__(self, states, start, delta, out):
        self.states, self.start, self.delta, self.out = states, start, delta, out

    def run(self, word):
        q, written = self.start, []
        for c in word:
            written.append(self.out[(q, c)])
            q = self.delta[(q, c)]
        return "".join(written)


def moore_to_mealy(m):
    """Each move writes what the state it enters writes. The states stay."""
    out = {move: m.out[q] for move, q in m.delta.items()}
    return Mealy(m.states, m.start, dict(m.delta), out)


def mealy_to_moore(m):
    """Split each state by the outputs written on the moves into it."""
    entered = {q: set() for q in m.states}
    for move, q in m.delta.items():
        entered[q].add(m.out[move])
    first = min(m.out.values())
    copy, out = {}, {}  # copy[(q, o)] is the copy of q that writes o
    for q in m.states:
        for i, o in enumerate(sorted(entered[q]) or [first]):
            copy[(q, o)] = q + "'" * i
            out[q + "'" * i] = o
    delta = {}
    for (q, _), p in copy.items():
        for c in {c for (r, c) in m.delta if r == q}:
            target = m.delta[(q, c)]
            delta[(p, c)] = copy[(target, m.out[(q, c)])]
    return Moore(list(out), m.start, delta, out)  # q0 is its own first copy
