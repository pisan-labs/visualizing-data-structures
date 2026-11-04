def subsets(values, target=None):
    """Every subset of values, taking or skipping each value in turn: choose, explore,
    unchoose. With a target (values > 0), only the subsets with that sum, and branches
    that cannot reach it are pruned."""
    out = []
    chosen = []
    rest = [sum(values[i:]) for i in range(len(values) + 1)]

    def search(i, total):
        if target is not None and (total > target or total + rest[i] < target):
            return  # prune: this branch cannot reach the target
        if i == len(values):
            out.append(list(chosen))
            return
        chosen.append(values[i])  # choose
        search(i + 1, total + values[i])  # explore
        chosen.pop()  # unchoose
        search(i + 1, total)  # explore without it

    search(0, 0)
    return out


def permutations(values):
    """Every order of values: choose an unused value, explore, unchoose."""
    out = []
    chosen = []
    used = [False] * len(values)

    def search():
        if len(chosen) == len(values):
            out.append(list(chosen))
            return
        for k, v in enumerate(values):
            if not used[k]:
                used[k] = True
                chosen.append(v)  # choose
                search()  # explore
                chosen.pop()  # unchoose
                used[k] = False

    search()
    return out
