calls = 0  # counts every call, to compare the tree with the memoized DAG


def fib(n, memo=None):
    """fib(n). Pass a dict as memo to compute each subproblem once."""
    global calls
    calls += 1
    if n <= 1:
        return n
    if memo is not None and n in memo:
        return memo[n]
    x = fib(n - 1, memo)
    y = fib(n - 2, memo)
    if memo is not None:
        memo[n] = x + y
    return x + y


def binomial(n, k, memo=None):
    """C(n, k): the number of ways to choose k of n things."""
    global calls
    calls += 1
    if k == 0 or k == n:
        return 1
    if memo is not None and (n, k) in memo:
        return memo[(n, k)]
    x = binomial(n - 1, k - 1, memo)
    y = binomial(n - 1, k, memo)
    if memo is not None:
        memo[(n, k)] = x + y
    return x + y
