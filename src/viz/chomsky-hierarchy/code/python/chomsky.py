"""The Chomsky level of a grammar, from the form of its rules.

A rule is a pair (left, right) of strings. Capitals are variables, every other
character is a terminal, and "" is the empty string. The levels are tried from the
most restrictive out, and the first one whose form every rule fits is the answer.
"""

LEVELS = ["regular", "context-free", "context-sensitive", "unrestricted"]


def fits(level, left, right, start, start_on_right):
    """Whether the rule left -> right has the form this level asks for."""
    one_variable = len(left) == 1 and left.isupper()
    if level == "regular":
        # A -> wB or A -> w: terminals, then at most one variable, at the end.
        variables = [c for c in right if c.isupper()]
        return one_variable and (not variables or (len(variables) == 1 and right[-1].isupper()))
    if level == "context-free":
        return one_variable
    if level == "context-sensitive":
        # Never shrinks, except S -> eps for a start variable on no right side.
        if len(right) >= len(left):
            return True
        return right == "" and left == start and not start_on_right
    return True  # unrestricted: any rule with a variable on the left


def classify(rules, start):
    """The level, and the first rule that does not fit the level below it (None for regular)."""
    start_on_right = any(start in right for _, right in rules)
    below = None
    for level in LEVELS:
        misfits = [r for r in rules if not fits(level, r[0], r[1], start, start_on_right)]
        if not misfits:
            return level, below
        below = misfits[0]
