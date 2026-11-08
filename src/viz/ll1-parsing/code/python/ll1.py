"""LL(1) parsing: FIRST and FOLLOW sets, the parse table, and a predictive parse.

rules is a list of (head, body) pairs; a body is a tuple of symbols, () for eps.
Variables start with a capital letter; the first rule's head is the start variable.
"""

EPS, END = "eps", "$"


def is_var(s):
    return s[0].isupper()


def first_of(first, symbols):
    out = set()
    for s in symbols:
        if not is_var(s):
            return out | {s}
        out |= first[s] - {EPS}
        if EPS not in first[s]:
            return out
    return out | {EPS}


def first_follow(rules, variables):
    first = {v: set() for v in variables}
    changed = True
    while changed:
        changed = False
        for head, body in rules:
            new = first_of(first, body) - first[head]
            if new:
                first[head] |= new
                changed = True
    follow = {v: set() for v in variables}
    follow[rules[0][0]].add(END)
    changed = True
    while changed:
        changed = False
        for head, body in rules:
            for k, b in enumerate(body):
                if not is_var(b):
                    continue
                rest = first_of(first, body[k + 1 :])
                new = (rest - {EPS}) | (follow[head] if EPS in rest else set())
                if new - follow[b]:
                    follow[b] |= new
                    changed = True
    return first, follow


def ll1_table(rules, first, follow):
    """table[head, a] lists the rules (by index) for that cell; two or more is a conflict."""
    table = {}
    for i, (head, body) in enumerate(rules):
        f = first_of(first, body)
        cols = (f - {EPS}) | (follow[head] if EPS in f else set())
        for a in cols:
            table.setdefault((head, a), []).append(i)
    return table


def parse(rules, table, word, cap=40):
    """Returns ("accept" | "reject" | "gave-up", moves). Takes the first rule in a cell."""
    stack, inp, pos, moves = [END, rules[0][0]], list(word) + [END], 0, 0
    while True:
        top, a = stack[-1], inp[pos]
        if top == END and a == END:
            return "accept", moves
        if moves >= cap:
            return "gave-up", moves
        if not is_var(top):
            if top != a:
                return "reject", moves
            stack.pop()
            pos += 1
        elif (top, a) in table:
            stack.pop()
            stack.extend(reversed(rules[table[top, a][0]][1]))
        else:
            return "reject", moves
        moves += 1
