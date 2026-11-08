"""Convert a context-free grammar to Chomsky normal form.

A grammar is a list of (head, body) rules; a body is a tuple of symbols, () for eps.
Variables start with a capital letter. The first rule's head is the start variable.
"""


def is_var(s):
    return s[0].isupper()


def is_unit(body):
    return len(body) == 1 and is_var(body[0])


def fresh(used, letter, k):
    while f"{letter}{k}" in used:
        k += 1
    used.add(f"{letter}{k}")
    return f"{letter}{k}"


def to_cnf(rules, term_first=True):
    used = {s for head, body in rules for s in (head, *body) if is_var(s)}
    start = fresh(used, rules[0][0][0], 0)
    rules = [(start, (rules[0][0],))] + list(rules)  # START

    # DEL: find the nullable variables, then copy rules with some of them left out.
    nullable, changed = set(), True
    while changed:
        changed = False
        for head, body in rules:
            if head not in nullable and all(s in nullable for s in body):
                nullable.add(head)
                changed = True
    if nullable:
        i = 0
        while i < len(rules):
            head, body = rules[i]
            at = [k for k, s in enumerate(body) if s in nullable]
            added = 0
            for mask in range(1, 1 << len(at)):
                drop = {at[j] for j in range(len(at)) if mask >> j & 1}
                new = tuple(s for k, s in enumerate(body) if k not in drop)
                if new and new != (head,) and (head, new) not in rules:
                    added += 1
                    rules.insert(i + added, (head, new))
            i += 1 + added
        rules = [(h, b) for h, b in rules if b and b != (h,)]
        if start in nullable:
            rules.append((start, ()))

    # UNIT: each variable takes the other rules of every variable it becomes.
    if any(is_unit(b) for _, b in rules):
        new = []
        for a in dict.fromkeys(h for h, _ in rules):
            reach = [a]
            for b in reach:
                for h, body in rules:
                    if h == b and is_unit(body) and body[0] not in reach:
                        reach.append(body[0])
            for b in reach:
                for h, body in rules:
                    if h == b and not is_unit(body) and (a, body) not in new:
                        new.append((a, body))
        rules = new

    def term(rules):  # TERM: a variable for each terminal in a long right side
        names = {}
        for _, body in rules:
            for s in body:
                if len(body) >= 2 and not is_var(s) and s not in names:
                    names[s] = fresh(used, "U", 1)
        rules = [(h, tuple(names.get(s, s) for s in b) if len(b) >= 2 else b) for h, b in rules]
        return rules + [(u, (a,)) for a, u in names.items()]

    def split(rules):  # BIN: break long right sides into pairs
        out = []
        for head, body in rules:
            h = head
            for s in body[:-2]:
                v = fresh(used, head[0], 1)
                out.append((h, (s, v)))
                h = v
            out.append((h, body[-2:] if len(body) > 2 else body))
        return out

    return split(term(rules)) if term_first else term(split(rules))
