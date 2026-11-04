def factorial(n):
    """n! for n >= 0. Each call waits for factorial(n - 1), then multiplies."""
    if n == 0:
        return 1
    return n * factorial(n - 1)


def factorial_tail(n, acc=1):
    """n! with an accumulator: the recursive call is the last thing it does (a tail call).
    Python does not optimize tail calls, so this still uses one frame per call."""
    if n == 0:
        return acc
    return factorial_tail(n - 1, n * acc)
