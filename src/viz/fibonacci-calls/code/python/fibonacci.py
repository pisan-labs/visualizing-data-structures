calls = 0  # counts every call, to show how much work each version does


def fib(n):
    """fib(n) the slow way: every call above the base cases makes two more."""
    global calls
    calls += 1
    if n <= 1:
        return n
    x = fib(n - 1)
    y = fib(n - 2)
    return x + y


def fib_memo(n, memo):
    """The same recursion, but each answer is computed once and kept in memo (a dict)."""
    global calls
    calls += 1
    if n <= 1:
        return n
    if n in memo:
        return memo[n]
    x = fib_memo(n - 1, memo)
    y = fib_memo(n - 2, memo)
    memo[n] = x + y
    return memo[n]
