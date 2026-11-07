"""Find a leftmost derivation by breadth-first search over sentential forms.

A grammar maps each variable to its right sides, in order. Capitals are variables,
every other character is a terminal, and "" is the empty word. Forms are strings.
"""
from collections import deque

CAP = 10000


def first_variable(form):
    return next((i for i, c in enumerate(form) if c.isupper()), -1)


def shortest_words(rules, variables):
    """The length of the shortest word each variable derives (infinity: none)."""
    best = {v: float("inf") for v in variables}
    changed = True
    while changed:
        changed = False
        for head, bodies in rules.items():
            for body in bodies:
                n = sum(best[c] if c.isupper() else 1 for c in body)
                if n < best[head]:
                    best[head] = n
                    changed = True
    return best


def leftmost_derivation(rules, start, word):
    """The forms of a shortest leftmost derivation of word.

    Returns None when there is none, or "gave up" after CAP forms.
    """
    variables = set(rules) | {c for bodies in rules.values() for b in bodies for c in b if c.isupper()}
    shortest = shortest_words(rules, variables)
    widest = max([1] + [len(b) for bodies in rules.values() for b in bodies])
    n = len(word)
    # No leftmost form in a smallest parse tree's derivation is longer than this.
    longest = n + 1 + (widest - 1) * len(variables) * (n + 1)

    def fits(form):
        if len(form) > longest:
            return False
        if sum(shortest[c] if c.isupper() else 1 for c in form) > n:
            return False
        i = first_variable(form)
        return form == word if i < 0 else word.startswith(form[:i])

    parent = {start: None}
    queue = deque([start])
    tried = 0
    while queue:
        if tried == CAP:
            return "gave up"
        form = queue.popleft()
        tried += 1
        i = first_variable(form)
        for body in rules.get(form[i], []):
            child = form[:i] + body + form[i + 1:]
            if child in parent or not fits(child):
                continue
            parent[child] = form
            if first_variable(child) < 0:
                forms = [child]
                while parent[forms[-1]] is not None:
                    forms.append(parent[forms[-1]])
                return forms[::-1]
            queue.append(child)
    return None
