"""CYK: decide whether a grammar in Chomsky normal form generates a word.

rules is a list of (head, body) pairs. A body is a tuple of one terminal, of two
variables, or () for the rule start -> eps.
"""


def cyk(rules, start, word):
    """Returns (accepted, table): table[length, i] is the set of variables
    that derive the substring of that length starting at i."""
    n = len(word)
    if n == 0:
        return (start, ()) in rules, {}
    table = {(length, i): set() for length in range(1, n + 1) for i in range(n - length + 1)}
    for i, symbol in enumerate(word):
        for head, body in rules:
            if body == (symbol,):
                table[1, i].add(head)
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            for k in range(1, length):  # the left part has k symbols
                left, right = table[k, i], table[length - k, i + k]
                for head, body in rules:
                    if len(body) == 2 and body[0] in left and body[1] in right:
                        table[length, i].add(head)
    return start in table[n, 0], table
