EPS = ""  # the symbol of an epsilon-move


class NFA:
    """A nondeterministic finite automaton with epsilon-moves (Sipser).

    delta maps (state, symbol) to a set of states; the symbol EPS marks an
    epsilon-move. The machine is in a set of states at once, and it accepts
    when that set holds an accept state after the whole word is read.
    """

    def __init__(self, start, accept, delta):
        self.start = start
        self.accept = set(accept)
        self.delta = delta

    def closure(self, states):
        """E(S): the states, and every state their epsilon-moves reach."""
        seen = set(states)
        todo = list(states)
        while todo:
            q = todo.pop()
            for r in self.delta.get((q, EPS), ()):
                if r not in seen:  # an epsilon-loop stops here
                    seen.add(r)
                    todo.append(r)
        return seen

    def run(self, word):
        """The set of states the machine is in after reading the word."""
        current = self.closure({self.start})
        for c in word:
            moved = {r for q in current for r in self.delta.get((q, c), ())}
            current = self.closure(moved)
            if not current:
                break  # every branch has died
        return current

    def accepts(self, word):
        return bool(self.run(word) & self.accept)
