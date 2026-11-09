from collections import deque


class Dfa:
    """A complete DFA: delta[(state, symbol)] is the next state."""

    def __init__(self, alphabet, start, accept, delta):
        self.alphabet = alphabet  # in order
        self.start = start
        self.accept = set(accept)
        self.delta = delta

    def run(self, word):
        q = self.start
        for c in word:
            q = self.delta[(q, c)]
        return q


def apart(dfa, x, y):
    """The shortest suffix z with exactly one of xz and yz in L, or None if x ≡ y.

    A breadth-first search over pairs of states, from the pair x and y reach, symbols in
    alphabet order, so z is also the first of its length in alphabet order.
    """
    start = (dfa.run(x), dfa.run(y))
    seen = {start}
    queue = deque([(start, "")])
    while queue:
        (p, q), z = queue.popleft()
        if (p in dfa.accept) != (q in dfa.accept):
            return z
        for c in dfa.alphabet:
            pair = (dfa.delta[(p, c)], dfa.delta[(q, c)])
            if pair not in seen:
                seen.add(pair)
                queue.append((pair, z + c))
    return None


def classes(dfa, most=8):
    """The classes of ≡_L, each named by its shortest word, and the moves between them.

    Returns (words, moves) with moves as (from class, symbol, to class), or None when there
    are more than `most` classes.
    """
    words, moves = [""], []
    i = 0
    while i < len(words):
        for c in dfa.alphabet:
            x = words[i] + c
            j = next((j for j, y in enumerate(words) if apart(dfa, x, y) is None), None)
            if j is None:  # told apart from every class so far: a new class
                if len(words) == most:
                    return None
                j = len(words)
                words.append(x)
            moves.append((i, c, j))
        i += 1
    return words, moves
