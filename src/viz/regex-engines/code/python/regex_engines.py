"""Two ways to match a word on the NFA that Thompson's construction builds from a regular
expression: backtracking (Perl, Python's re, Java, JavaScript) and NFA simulation (RE2, grep,
Go). Both count steps: one step is one visit to a state at a position in the word.
"""

EPS = None  # the symbol of an ε-move
CAP = 100_000  # the backtracker gives up after this many steps


class NFA:
    def __init__(self, states, start, accept):
        self.moves = [[] for _ in range(states)]  # moves[q]: (symbol, r), in the order tried
        self.start, self.accept = start, accept

    def add(self, p, symbol, q):
        self.moves[p].append((symbol, q))

    def closure(self, states):
        """Every state reachable from `states` by ε-moves alone."""
        seen, todo = set(states), list(states)
        while todo:
            for symbol, r in self.moves[todo.pop()]:
                if symbol is EPS and r not in seen:
                    seen.add(r)
                    todo.append(r)
        return seen


def backtrack(nfa, word):
    """One path at a time, depth first. Returns (answer, steps)."""
    steps = 0
    # Choices left for later: (state, symbols read, states passed at this position).
    stack = [(nfa.start, 0, frozenset())]
    while stack:
        q, i, seen = stack.pop()
        while True:
            steps += 1
            if q == nfa.accept and i == len(word):
                return "accept", steps
            if steps == CAP:
                return "stopped", steps
            seen = seen | {q}
            ways = []
            for symbol, r in nfa.moves[q]:
                if symbol is EPS:
                    if r not in seen:  # an ε-loop back to a state passed here goes nowhere
                        ways.append((r, i, seen))
                elif i < len(word) and word[i] == symbol:
                    ways.append((r, i + 1, frozenset()))
            if not ways:
                break  # dead end: back up to the latest choice
            stack.extend(reversed(ways[1:]))  # the other ways, for later
            q, i, seen = ways[0]
    return "reject", steps


def simulate(nfa, word):
    """Every path at once: the set of states the NFA could be in. Returns (answer, steps)."""
    current = nfa.closure({nfa.start})
    steps = len(current)
    for c in word:
        if not current:
            break
        current = nfa.closure({r for q in current for s, r in nfa.moves[q] if s == c})
        steps += len(current)
    return ("accept" if nfa.accept in current else "reject"), steps
