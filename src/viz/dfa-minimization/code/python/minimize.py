def minimize(delta, start, accept):
    """Moore's partition refinement.

    States are 0..n-1; delta[q][c] is the state q goes to on symbol c, or None for a
    missing move; accept is a set of states. A dead state, if one is needed, is n.
    Returns the blocks of equivalent states, in the order of their first state, and
    moves[i][c]: the block that block i goes to on symbol c.
    """
    n, k = len(delta), len(delta[0])
    # Complete the DFA: a dead state takes every missing move.
    if any(t is None for row in delta for t in row):
        delta = [[n if t is None else t for t in row] for row in delta] + [[n] * k]
    # Keep only the states the start can reach.
    seen, stack = {start}, [start]
    while stack:
        for t in delta[stack.pop()]:
            if t not in seen:
                seen.add(t)
                stack.append(t)
    states = sorted(seen)
    # Start from {F, Q - F}; split blocks by signature until nothing splits.
    block = {q: int(q in accept) for q in states}
    while True:
        sig = {q: (block[q], *(block[t] for t in delta[q])) for q in states}
        ids = {}
        for q in states:
            ids.setdefault(sig[q], len(ids))
        stable = len(ids) == len(set(block.values()))
        block = {q: ids[sig[q]] for q in states}
        if stable:
            break
    groups = {}
    for q in states:
        groups.setdefault(block[q], []).append(q)
    blocks = list(groups.values())
    index = {q: i for i, b in enumerate(blocks) for q in b}
    moves = [[index[t] for t in delta[b[0]]] for b in blocks]
    return blocks, moves
