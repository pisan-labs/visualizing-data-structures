"""The Master theorem for T(n) = a T(n/b) + n^d lg^k n, and the recurrence itself."""


def master_case(a, b, d, k=0):
    """Which CLRS case applies: "1", "2", "3", or "none"."""
    # d against log_b a, compared without floating point: b^d against a.
    if b**d < a:
        return "1"  # leaves dominate: Theta(n^(log_b a))
    if b**d > a:
        return "3"  # root dominates: Theta(f(n))
    if k >= 0:
        return "2"  # every level ties: Theta(n^d lg^(k+1) n)
    return "none"  # d = log_b a with k < 0 falls in the gap


def T(a, b, d, n):
    """T(1) = 1 and T(n) = a T(n/b) + n^d, for n a power of b."""
    if n == 1:
        return 1
    return a * T(a, b, d, n // b) + n**d
