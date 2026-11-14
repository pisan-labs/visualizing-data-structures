def combination_sum(candidates, target, reuse=True):
    """Every combination of candidates that adds up to target, each a sorted list.

    reuse=True: a candidate may be used again and again. reuse=False: each candidate once
    (a value given twice may be used twice).
    """
    c = sorted(set(candidates)) if reuse else sorted(candidates)
    out, chosen = [], []

    def search(start, left):
        if left == 0:
            out.append(chosen[:])
            return
        for i in range(start, len(c)):
            if not reuse and i > start and c[i] == c[i - 1]:
                continue  # the same value again at this depth: the same combinations
            if c[i] > left:
                break  # c is sorted, so every later candidate is bigger too
            chosen.append(c[i])
            search(i if reuse else i + 1, left - c[i])
            chosen.pop()

    search(0, target)
    return out
