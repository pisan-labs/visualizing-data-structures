class DFA:
    """A deterministic finite automaton (Sipser): states, a start state q0,
    accept states F and a transition function delta.

    delta maps (state, symbol) to a state. A move may be missing; the
    machine then has nowhere to go, and the word is rejected.
    """

    def __init__(self, start, accept, delta):
        self.start = start
        self.accept = set(accept)
        self.delta = dict(delta)

    def run(self, word):
        """The state the machine ends in, or None if a move is missing."""
        q = self.start
        for c in word:
            q = self.delta.get((q, c))
            if q is None:
                return None  # no move: reject
        return q

    def accepts(self, word):
        return self.run(word) in self.accept
