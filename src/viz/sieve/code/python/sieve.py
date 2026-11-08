def sieve(n):
    """The primes up to n (n >= 2) by the sieve of Eratosthenes."""
    crossed = [False] * (n + 1)
    p = 2
    while p * p <= n:
        if not crossed[p]:
            for j in range(p * p, n + 1, p):
                crossed[j] = True
        p += 1
    return [k for k in range(2, n + 1) if not crossed[k]]
