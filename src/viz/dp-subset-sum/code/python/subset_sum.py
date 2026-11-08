def subset_sum_table(xs, target):
    """reach[i][t] is True when some of the first i numbers add up to exactly t."""
    n = len(xs)
    reach = [[False] * (target + 1) for _ in range(n + 1)]
    reach[0][0] = True
    for i, x in enumerate(xs, start=1):
        for t in range(target + 1):
            reach[i][t] = reach[i - 1][t]  # leave x out
            if x <= t and reach[i - 1][t - x]:
                reach[i][t] = True  # take x
    return reach


def subset_sum(xs, target):
    """A list of numbers from xs that adds up to target, in their order, or None."""
    reach = subset_sum_table(xs, target)
    if not reach[len(xs)][target]:
        return None
    taken = []
    t = target
    for i in range(len(xs), 0, -1):
        if not reach[i - 1][t]:
            taken.append(xs[i - 1])
            t -= xs[i - 1]
    return taken[::-1]
