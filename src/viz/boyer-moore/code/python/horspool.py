# Boyer-Moore-Horspool: compare from the right end of the pattern, and
# after each alignment slide by the table entry for the text character
# under the pattern's last position.


def shift_table(pattern):
    """shift[c]: how far to slide when c is under the last position."""
    m = len(pattern)
    # Later characters overwrite earlier ones; any other character: m.
    return {c: m - 1 - j for j, c in enumerate(pattern[:-1])}


def horspool_search(text, pattern):
    """Return every shift s where pattern occurs in text."""
    n, m = len(text), len(pattern)
    shift = shift_table(pattern)
    found = []
    s = 0
    while s <= n - m:
        j = m - 1
        while j >= 0 and text[s + j] == pattern[j]:
            j -= 1
        if j < 0:
            found.append(s)
        s += shift.get(text[s + m - 1], m)
    return found
