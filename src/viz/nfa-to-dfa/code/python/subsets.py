from collections import deque

EPS = "eps"


def closure(moves, states):
    """The ε-closure: the states, plus every state their ε-moves reach."""
    seen = set(states)
    stack = list(states)
    while stack:
        q = stack.pop()
        for r in moves.get((q, EPS), []):
            if r not in seen:
                seen.add(r)
                stack.append(r)
    return frozenset(seen)


def subset_construction(moves, alphabet, start, accept):
    """Sipser's subset construction, breadth first from the start set.

    moves maps (state, symbol) to a list of states; the symbol "eps" is an ε-move.
    Returns the DFA's states (sets of NFA states) in the order they are found,
    delta[i][c] (the index of the state set i goes to on c), and the accept states.
    """
    first = closure(moves, [start])
    sets = [first]
    index = {first: 0}
    delta = []
    queue = deque([first])
    while queue:
        T = queue.popleft()
        row = {}
        for c in alphabet:
            M = [r for q in T for r in moves.get((q, c), [])]
            U = closure(moves, M)
            if U not in index:
                index[U] = len(sets)
                sets.append(U)
                queue.append(U)
            row[c] = index[U]
        delta.append(row)
    accepting = [i for i, T in enumerate(sets) if T & accept]
    return sets, delta, accepting
