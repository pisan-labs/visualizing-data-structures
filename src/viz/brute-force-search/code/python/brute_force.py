# Brute-force string search: put the pattern at every shift s and
# compare it with text[s:s + m] from left to right, stopping at the
# first mismatch.


def search(text, pattern):
    """Return every shift s where pattern occurs in text."""
    n, m = len(text), len(pattern)
    found = []
    for s in range(n - m + 1):
        j = 0
        while j < m and text[s + j] == pattern[j]:
            j += 1
        if j == m:
            found.append(s)
    return found
