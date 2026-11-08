"""LR(0) and SLR(1) parsing: item sets, the ACTION/GOTO table, and a shift-reduce parse.

rules is a list of (head, body) pairs, body a tuple of symbols (() for eps). Variables start
with a capital letter. rules[0] must be the augmented rule S' -> S.
"""

END = "$"


def is_var(s):
    return s[0].isupper()


def closure(rules, items):
    items = list(items)
    for rule, dot in items:  # the list grows as we go
        body = rules[rule][1]
        if dot < len(body) and is_var(body[dot]):
            for k, (head, _) in enumerate(rules):
                if head == body[dot] and (k, 0) not in items:
                    items.append((k, 0))
    return items


def item_sets(rules):
    """The LR(0) automaton: a list of item sets and a dict (state, symbol) -> state."""
    sets, edges, i = [closure(rules, [(0, 0)])], {}, 0
    while i < len(sets):
        symbols = []
        for rule, dot in sets[i]:
            body = rules[rule][1]
            if dot < len(body) and body[dot] not in symbols:
                symbols.append(body[dot])
        for x in symbols:
            kernel = [(r, d + 1) for r, d in sets[i] if d < len(rules[r][1]) and rules[r][1][d] == x]
            new = closure(rules, kernel)
            j = next((k for k, s in enumerate(sets) if set(s) == set(new)), None)
            if j is None:
                sets.append(new)
                j = len(sets) - 1
            edges[i, x] = j
        i += 1
    return sets, edges


def follow_sets(rules):
    """FOLLOW of each variable (for SLR(1)), from FIRST sets; rules[0] is S' -> S."""
    first = {h: set() for h, _ in rules}

    def first_of(symbols):
        out = set()
        for s in symbols:
            if not is_var(s):
                return out | {s}
            out |= first.get(s, set()) - {""}
            if "" not in first.get(s, set()):
                return out
        return out | {""}

    changed = True
    while changed:
        changed = False
        for head, body in rules:
            new = first_of(body) - first[head]
            if new:
                first[head] |= new
                changed = True
    follow = {h: set() for h, _ in rules}
    follow[rules[0][0]].add(END)
    changed = True
    while changed:
        changed = False
        for head, body in rules:
            for k, b in enumerate(body):
                if is_var(b):
                    rest = first_of(body[k + 1 :])
                    new = (rest - {""}) | (follow[head] if "" in rest else set())
                    if new - follow.setdefault(b, set()):
                        follow[b] |= new
                        changed = True
    return follow


def lr_table(rules, sets, edges, follow=None):
    """action[(state, a)] is a list of ("s", j), ("r", rule) or ("acc",). With follow (SLR(1)),
    a reduce goes only under FOLLOW of its head; without it (LR(0)), under every terminal."""
    terminals = sorted({s for _, b in rules for s in b if not is_var(s)}) + [END]
    action, goto = {}, {}
    for (i, x), j in edges.items():
        if is_var(x):
            goto[i, x] = j
        else:
            action.setdefault((i, x), []).append(("s", j))
    for i, items in enumerate(sets):
        for rule, dot in items:
            head, body = rules[rule]
            if dot < len(body):
                continue
            if rule == 0:
                action.setdefault((i, END), []).append(("acc",))
                continue
            for a in follow[head] if follow else terminals:
                action.setdefault((i, a), []).append(("r", rule))
    return action, goto


def parse(rules, action, goto, word, cap=200):
    """Returns ("accept" | "reject", moves)."""
    stack, inp, pos, moves = [0], list(word) + [END], 0, 0
    while True:
        acts = action.get((stack[-1], inp[pos]))
        if not acts or moves >= cap:
            return "reject", moves
        act = acts[0]
        if act[0] == "acc":
            return "accept", moves
        if act[0] == "s":
            stack.append(act[1])
            pos += 1
        else:
            head, body = rules[act[1]]
            del stack[len(stack) - len(body) :]
            if (stack[-1], head) not in goto:
                return "reject", moves
            stack.append(goto[stack[-1], head])
        moves += 1
