def knapsack_table(items, capacity):
    """best[i][c] is the best value from the first i items with capacity c.

    items is a list of (weight, value) pairs; each item goes in whole or not at all.
    """
    n = len(items)
    best = [[0] * (capacity + 1) for _ in range(n + 1)]
    for i, (w, v) in enumerate(items, start=1):
        for c in range(capacity + 1):
            best[i][c] = best[i - 1][c]  # skip item i
            if w <= c and best[i - 1][c - w] + v > best[i][c]:
                best[i][c] = best[i - 1][c - w] + v  # take item i
    return best


def knapsack(items, capacity):
    """The best value and the items (numbered from 1) that make it."""
    best = knapsack_table(items, capacity)
    taken = []
    c = capacity
    for i in range(len(items), 0, -1):
        if best[i][c] != best[i - 1][c]:
            taken.append(i)
            c -= items[i - 1][0]
    return best[len(items)][capacity], sorted(taken)
