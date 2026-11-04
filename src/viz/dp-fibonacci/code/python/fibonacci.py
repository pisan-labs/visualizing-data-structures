def fib(n):
    """F(n) bottom-up: fill F[0..n] from the base cases."""
    f = [0] * (n + 1)
    if n > 0:
        f[1] = 1
    for i in range(2, n + 1):
        f[i] = f[i - 1] + f[i - 2]
    return f[n]


def fib_memo(n, memo=None):
    """F(n) top-down: recurse, but remember every answer in a memo."""
    if memo is None:
        memo = [None] * (n + 1)
    if memo[n] is None:
        if n <= 1:
            memo[n] = n
        else:
            memo[n] = fib_memo(n - 1, memo) + fib_memo(n - 2, memo)
    return memo[n]
