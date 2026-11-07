EMPTY = ("∅", "empty")
EPS = ("ε", "eps")

# A label is (text, kind), the kind being "empty", "eps", "sym", "star", "concat" or
# "union", so we know where parentheses go. The constructors simplify with the identities
# R∅ = ∅, Rε = R, R ∪ ∅ = R, ε* = ε and ∅* = ε.


def union(x, y):
    if x[1] == "empty":
        return y
    if y[1] == "empty":
        return x
    return (x[0] + "∪" + y[0], "union")


def concat(x, y):
    if x[1] == "empty" or y[1] == "empty":
        return EMPTY
    if x[1] == "eps":
        return y
    if y[1] == "eps":
        return x

    def part(r):
        return "(" + r[0] + ")" if r[1] == "union" else r[0]

    return (part(x) + part(y), "concat")


def star(x):
    if x[1] in ("empty", "eps"):
        return EPS
    inner = x[0] if x[1] == "sym" else "(" + x[0] + ")"
    return (inner + "*", "star")


def to_regex(states, start, accept, moves):
    """Sipser's state elimination. states: the DFA's states in the order to rip them;
    moves: (p, symbol, q) triples. Returns the expression's text."""
    S, F = object(), object()  # the new start and accept states
    label = {}  # (p, q) -> label; a missing pair means ∅

    def add(p, q, r):
        label[p, q] = union(label.get((p, q), EMPTY), r)

    add(S, start, EPS)
    for p, c, q in moves:
        add(p, q, (c, "sym"))  # parallel moves unite: a∪b
    for q in accept:
        add(q, F, EPS)
    for rip in states:
        loop = star(label.get((rip, rip), EMPTY))
        ins = [p for (p, q) in label if q == rip and p != rip]
        outs = [q for (p, q) in label if p == rip and q != rip]
        for p in ins:
            for q in outs:
                path = concat(concat(label[p, rip], loop), label[rip, q])
                label[p, q] = union(path, label.get((p, q), EMPTY))  # R1(R2)*R3 ∪ R4
        label = {k: v for k, v in label.items() if rip not in k}
    return label.get((S, F), EMPTY)[0]
