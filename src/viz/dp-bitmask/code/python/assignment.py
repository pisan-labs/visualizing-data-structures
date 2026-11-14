def cheapest(cost):
    """cost[w][t]: what worker w charges for task t, n x n.
    Returns the least total and the task of each worker."""
    n = len(cost)
    full = (1 << n) - 1
    f = [None] * (1 << n)  # f[mask]: cheapest way to give the tasks in mask to the first workers
    last = [0] * (1 << n)  # the task the last of those workers takes in that way
    f[0] = 0
    for mask in range(1, full + 1):  # mask minus a task is smaller: already done
        k = bin(mask).count("1")  # k tasks go to workers 0..k-1
        for t in range(n):
            if mask >> t & 1:
                c = f[mask ^ (1 << t)] + cost[k - 1][t]  # worker k-1 takes task t last
                if f[mask] is None or c < f[mask]:
                    f[mask], last[mask] = c, t
    tasks = [0] * n
    mask = full
    for w in range(n - 1, -1, -1):  # walk back from the full mask
        tasks[w] = last[mask]
        mask ^= 1 << last[mask]
    return f[full], tasks
