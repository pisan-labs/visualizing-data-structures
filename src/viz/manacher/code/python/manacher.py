# Manacher's algorithm. With a separator between the characters and at
# both ends, every palindrome has a center cell, and p[i] is the radius of
# the longest palindrome centered at t[i] (its length in s). c and r mark
# the palindrome that reaches furthest right: r = c + p[c].


def radii(s):
    """p[i] for every cell of t = '#' + '#'.join(s) + '#'."""
    t = "#" + "#".join(s) + "#"
    n = len(t)
    p = [0] * n
    c = r = 0
    for i in range(n):
        if i < r:  # inside: copy the mirror's radius, cut off at r
            p[i] = min(r - i, p[2 * c - i])
        while (i - p[i] - 1 >= 0 and i + p[i] + 1 < n
               and t[i - p[i] - 1] == t[i + p[i] + 1]):
            p[i] += 1
        if i + p[i] > r:  # reaches further right: the new one to mirror
            c, r = i, i + p[i]
    return p


def longest_palindrome(s):
    """The longest palindromic substring of s (the leftmost on ties)."""
    p = radii(s)
    best = max(range(len(p)), key=lambda i: (p[i], -i))
    start = (best - p[best]) // 2
    return s[start:start + p[best]]
