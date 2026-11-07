from collections import deque

EPS = ""  # read nothing, pop nothing, or push nothing
CAP = 200  # the search gives up after this many configurations


class PDA:
    """A pushdown automaton (Sipser), run by a breadth-first search.

    Each move is (state, read, pop, next state, push): read a symbol or EPS,
    pop a symbol or EPS, then push a string whose first symbol ends up on top.
    A configuration is (state, symbols read, stack), the stack top first.
    """

    def __init__(self, start, accept, moves, stack="", by_empty_stack=False):
        self.start = start
        self.accept = set(accept)
        self.moves = moves
        self.stack = stack  # what the stack holds at the start
        self.by_empty_stack = by_empty_stack

    def accepting(self, config, word):
        state, read, stack = config
        if read < len(word):
            return False
        return stack == "" if self.by_empty_stack else state in self.accept

    def next_configs(self, config, word):
        state, read, stack = config
        for q, a, x, r, push in self.moves:
            if q != state:
                continue
            if a != EPS and (read == len(word) or word[read] != a):
                continue
            if x != EPS and not stack.startswith(x):
                continue
            rest = stack[len(x):]
            yield (r, read + len(a), push + rest)

    def run(self, word):
        """("accept", moves of a shortest accepting computation), ("reject",
        None) when every branch dies, or ("stopped", None) at the cap."""
        start = (self.start, 0, self.stack)
        if self.accepting(start, word):
            return "accept", 0
        depth = {start: 0}  # every configuration seen, with its moves
        queue = deque([start])
        while queue:
            config = queue.popleft()
            for nxt in self.next_configs(config, word):
                if nxt in depth:
                    continue  # seen before: a loop of moves ends here
                if len(depth) == CAP:
                    return "stopped", None
                depth[nxt] = depth[config] + 1
                if self.accepting(nxt, word):
                    return "accept", depth[nxt]
                queue.append(nxt)
        return "reject", None
