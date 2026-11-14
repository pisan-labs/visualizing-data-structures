END = "</s>"


def ngram_model(sentences, n):
    """P(w | the n-1 words before it), by counting. Returns a function of the words so far that
    gives {word: probability}, or None when those n-1 words never occurred together."""
    counts = {}
    for s in sentences:
        words = ["<s>"] * (n - 1) + s.split() + [END]
        for i in range(n - 1, len(words)):
            row = counts.setdefault(tuple(words[i - n + 1 : i]), {})
            row[words[i]] = row.get(words[i], 0) + 1

    def model(prefix):
        row = counts.get(tuple((["<s>"] * (n - 1) + prefix)[-(n - 1) :]))
        if row is None:
            return None
        total = 0
        for c in row.values():
            total += c
        return {w: c / total for w, c in row.items()}

    return model


def ordered(dist):
    """Most likely first, ties alphabetical."""
    return sorted(dist, key=lambda w: (-dist[w], w))


def draw(dist, u):
    """The word whose stretch of [0, 1) holds u, laying the words end to end."""
    cum = 0.0
    for w in ordered(dist):
        cum += dist[w]
        if u < cum:
            return w
    return ordered(dist)[-1]


def leftover(p, q):
    """norm(max(0, p - q)): what the target wanted more than the draft gave."""
    r = {w: p[w] - q.get(w, 0) for w in ordered(p) if p[w] - q.get(w, 0) > 0}
    total = 0.0
    for v in r.values():
        total += v
    return {w: v / total for w, v in r.items()}


def speculative_step(prefix, k, draft, target, us, greedy=False):
    """One round: the draft proposes up to k words, one target pass checks them all.
    us yields the uniform numbers. Returns (drafts accepted, the words the round adds)."""
    drafts, qs = [], []
    for _ in range(k):
        q = draft(prefix + drafts)
        x = ordered(q)[0] if greedy else draw(q, next(us))
        drafts.append(x)
        qs.append(q)
        if x == END:
            break
    # One pass of the target: p at every draft position, and after the last one.
    ps = [target(prefix + drafts[:i]) for i in range(len(drafts) + 1)]
    for i, x in enumerate(drafts):
        if greedy:
            ok = ordered(ps[i])[0] == x
        else:
            ok = next(us) < ps[i].get(x, 0) / qs[i][x]  # accept with chance min(1, p/q)
        if not ok:
            fix = ordered(ps[i])[0] if greedy else draw(leftover(ps[i], qs[i]), next(us))
            return i, drafts[:i] + [fix]
    if drafts and drafts[-1] == END:
        return len(drafts), drafts
    bonus = ordered(ps[-1])[0] if greedy else draw(ps[-1], next(us))
    return len(drafts), drafts + [bonus]
