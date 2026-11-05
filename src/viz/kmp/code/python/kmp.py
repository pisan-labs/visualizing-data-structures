# Knuth-Morris-Pratt. pi[j] is the length of the longest proper prefix
# of pattern[:j + 1] that is also a suffix of it. After a mismatch the
# pattern slides so that border lines up with the text it matched, and
# the text pointer s + q never moves back.


def prefix_function(p):
    """pi[j] for every j: the longest border of p[:j + 1]."""
    pi = [0] * len(p)
    q = 0
    for i in range(1, len(p)):
        while q > 0 and p[q] != p[i]:
            q = pi[q - 1]
        if p[q] == p[i]:
            q += 1
        pi[i] = q
    return pi


def kmp_search(text, pattern):
    """Return every shift s where pattern occurs in text."""
    n, m = len(text), len(pattern)
    pi = prefix_function(pattern)
    found = []
    s = q = 0  # at shift s, the first q characters are known to match
    while s <= n - m:
        while q < m and text[s + q] == pattern[q]:
            q += 1
        if q == m:
            found.append(s)
        if q == 0:
            s += 1
        else:
            s += q - pi[q - 1]
            q = pi[q - 1]
    return found
