# Rabin-Karp: compare a rolling hash of each window with the pattern's
# hash, and compare characters only when the hashes agree. Digits use
# d = 10 (each character is its digit); other text uses d = 256 (each
# character is its code). q = 13, as in the visualization's default.


def rabin_karp(text, pattern, q=13):
    """Return every shift s where pattern occurs in text."""
    n, m = len(text), len(pattern)
    if m > n:
        return []
    digits = (text + pattern).isdigit()
    d = 10 if digits else 256
    val = int if digits else ord
    h = pow(d, m - 1, q)  # the weight of a window's first character
    p = t = 0
    for i in range(m):
        p = (d * p + val(pattern[i])) % q
        t = (d * t + val(text[i])) % q
    found = []
    for s in range(n - m + 1):
        if p == t and text[s:s + m] == pattern:  # a hit, checked
            found.append(s)
        if s < n - m:  # roll: drop text[s], bring in text[s + m]
            t = (d * (t - val(text[s]) * h) + val(text[s + m])) % q
    return found
