def reverse(s):
    """The reverse of s: reverse everything after the first character, then add it."""
    if len(s) <= 1:
        return s
    return reverse(s[1:]) + s[0]


def reverse_in_place(a, i, j):
    """Reverse the list a between indices i and j by swapping the ends, then the inside."""
    if i >= j:
        return
    a[i], a[j] = a[j], a[i]
    reverse_in_place(a, i + 1, j - 1)
