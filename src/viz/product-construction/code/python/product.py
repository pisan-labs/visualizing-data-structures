from collections import deque

# Which pairs accept, given whether p accepts in A (x) and q accepts in B (y).
OPS = {
    "union": lambda x, y: x or y,
    "intersection": lambda x, y: x and y,
    "difference": lambda x, y: x and not y,
    "symmetric": lambda x, y: x != y,
}


class DFA:
    """delta maps (state, symbol) to a state. A missing move rejects."""

    def __init__(self, states, alphabet, start, accept, delta):
        self.states = list(states)
        self.alphabet = list(alphabet)
        self.start = start
        self.accept = set(accept)
        self.delta = dict(delta)

    def complete(self):
        """The same DFA with a dead state taking every missing move."""
        missing = [(q, c) for q in self.states for c in self.alphabet if (q, c) not in self.delta]
        if not missing:
            return self
        dead, i = "dead", 2
        while dead in self.states:
            dead, i = f"dead{i}", i + 1
        delta = dict(self.delta)
        for q, c in missing + [(dead, c) for c in self.alphabet]:
            delta[(q, c)] = dead
        return DFA(self.states + [dead], self.alphabet, self.start, self.accept, delta)

    def complement(self):
        """Complete it, then accept exactly where it did not."""
        m = self.complete()
        return DFA(m.states, m.alphabet, m.start, set(m.states) - m.accept, m.delta)


def product(A, B, op):
    """Sipser's product construction, building only the pairs reachable from the start pair.

    A and B read the same alphabet. The product's states are pairs (p, q); on c, (p, q)
    goes to (A's move from p on c, B's move from q on c).
    """
    A, B = A.complete(), B.complete()
    start = (A.start, B.start)
    states, seen, delta = [start], {start}, {}
    queue = deque([start])
    while queue:
        pair = queue.popleft()
        p, q = pair
        for c in A.alphabet:
            r = (A.delta[(p, c)], B.delta[(q, c)])
            if r not in seen:
                seen.add(r)
                states.append(r)
                queue.append(r)
            delta[(pair, c)] = r
    accept = [(p, q) for p, q in states if OPS[op](p in A.accept, q in B.accept)]
    return DFA(states, A.alphabet, start, accept, delta)
