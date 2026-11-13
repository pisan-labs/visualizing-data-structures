import math

UNK = "[UNK]"
EPS = 1e-9  # scores closer than this count as equal: the first one found wins


def seed_vocab(words, size):
    """Every letter, plus the `size` most frequent substrings of 2+ letters seen at least twice.
    words: (word, count) pairs. Returns {piece: count}: letters A to Z, then by count."""
    letters, subs, first = {}, {}, {}
    for word, count in words:
        for i in range(len(word)):
            letters[word[i]] = letters.get(word[i], 0) + count
            for j in range(i + 2, len(word) + 1):
                s = word[i:j]
                if s not in subs:
                    first[s], subs[s] = len(first), 0
                subs[s] += count
    common = [s for s in subs if subs[s] >= 2]
    common.sort(key=lambda s: (-subs[s], -len(s), first[s]))
    vocab = {c: letters[c] for c in sorted(letters)}
    for s in common[:size]:
        vocab[s] = subs[s]
    return vocab


def log_probs(vocab):
    """log p(x) = log(count(x) / total count)."""
    total = 0
    for c in vocab.values():
        total += c
    return {x: math.log(c / total) for x, c in vocab.items()}


def viterbi(word, logp, skip=None):
    """The most probable split of word, and its log-probability. best[j] is the best score of
    the first j letters; a letter the vocabulary lacks becomes [UNK], 10 below the rarest."""
    unk = min([0.0, *logp.values()]) - 10
    n = len(word)
    best = [0.0] + [-math.inf] * n
    back = [None] * (n + 1)
    for j in range(1, n + 1):
        for i in range(j):  # the longest piece ending at j first
            x = word[i:j]
            if x in logp and x != skip:
                lp = logp[x]
            elif j == i + 1 and x not in logp:
                x, lp = UNK, unk
            else:
                continue
            if best[i] + lp > best[j] + EPS:
                best[j], back[j] = best[i] + lp, (i, x)
    pieces, j = [], n
    while j > 0:
        i, x = back[j]
        pieces.insert(0, x)
        j = i
    return pieces, best[n]


def cheaper(a, b):
    """(piece, rank, loss): a smaller loss, or on a tie the later piece in the seed order."""
    return a[2] < b[2] - EPS or (abs(a[2] - b[2]) <= EPS and a[1] > b[1])


def prune(words, vocab, floor=0):
    """One round: remove the cheapest fifth of the pieces of 2+ letters (never below floor).
    A piece's loss is how much the text's log-likelihood drops without it."""
    logp = log_probs(vocab)
    now = {w: viterbi(w, logp) for w, _ in words}
    losses = []
    for rank, x in enumerate(vocab):
        if len(x) < 2:
            continue  # letters always stay
        loss = 0.0
        for w, count in words:
            pieces, score = now[w]
            if x in pieces:
                loss += count * (score - viterbi(w, logp, x)[1])
        losses.append((x, rank, loss))
    n = len(losses)
    removed = []
    for _ in range(max(0, min(n - int(n * 0.8), n - floor))):
        k = 0
        for i in range(1, len(losses)):
            if cheaper(losses[i], losses[k]):
                k = i
        removed.append(losses.pop(k)[0])
    for x in removed:
        del vocab[x]
    return removed
