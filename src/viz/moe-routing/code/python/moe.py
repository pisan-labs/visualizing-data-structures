import math


def softmax(scores):
    m = max(scores)
    e = [math.exp(s - m) for s in scores]
    total = 0.0
    for v in e:
        total += v
    return [v / total for v in e]


def top(xs, count):
    """Indices of the count largest values, largest first, ties to the lower index."""
    left = list(range(len(xs)))
    out = []
    while len(out) < count and left:
        best = max(xs[i] for i in left)
        pick = next(i for i in left if xs[i] >= best - 1e-12)
        out.append(pick)
        left.remove(pick)
    return out


def route(x, w, k, cf, routing="token"):
    """Route T tokens (rows of x) to E experts with router weights w.

    Returns the assignments (token, expert, weight, kept), the capacity
    and the load-balance loss of Switch Transformer.
    """
    T, E = len(x), len(w[0])
    logits = []
    for row in x:
        out = []
        for e in range(E):
            s = 0.0
            for f in range(len(w)):
                s += row[f] * w[f][e]
            out.append(s)
        logits.append(out)
    p = [softmax(row) for row in logits]
    cap = math.ceil(cf * k * T / E)
    wanted, load, assignments = [0] * E, [0] * E, []
    if routing == "token":
        choices = [top(row, k) for row in logits]
        gates = [softmax([logits[t][e] for e in c]) for t, c in enumerate(choices)]
        for c in choices:
            for e in c:
                wanted[e] += 1
        for r in range(k):  # every first choice before any second choice
            for t in range(T):
                e = choices[t][r]
                assignments.append((t, e, gates[t][r], load[e] < cap))
                load[e] += 1
    else:  # expert choice: each expert takes the cap tokens that want it most
        for e in range(E):
            for t in top([p[t][e] for t in range(T)], cap):
                assignments.append((t, e, p[t][e], True))
                wanted[e] += 1
    total = 0
    for c in wanted:
        total += c
    loss = 0.0
    for e in range(E):
        f = wanted[e] / total  # share of the assignments
        s = 0.0
        for t in range(T):
            s += p[t][e]
        loss += f * (s / T)  # times the mean router probability
    return assignments, cap, E * loss
