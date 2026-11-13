import math

EOS = "</s>"


def beam_search(model, start, width, normalize=False, eos="shrink", max_len=5):
    """Beam search over a next-word model: model[word] lists (next word, probability).

    Returns the finished hypotheses in the order they finished, each as (words, log-prob),
    and the best of them.
    """
    beam = [([], start, 0.0)]  # (words so far, last word, log-probability)
    finished, room = [], width
    for _ in range(max_len):
        candidates = []
        for words, last, score in beam:
            for w, p in model.get(last, []):
                candidates.append((words + [w], w, score + math.log(p)))
        candidates.sort(key=lambda c: -c[2])  # best first; the sort is stable
        beam = []
        if eos == "shrink":  # a finished hypothesis leaves, and the beam narrows
            for c in candidates[:room]:
                if c[1] == EOS:
                    finished.append(c)
                    room -= 1
                else:
                    beam.append(c)
            if room == 0:
                break
        else:  # refill: keep width going; stop once width have finished
            for rank, c in enumerate(candidates):
                if c[1] == EOS:
                    if rank < width:
                        finished.append(c)
                elif len(beam) < width:
                    beam.append(c)
            if len(finished) >= width:
                beam = []
                break
        if not beam:
            break
    finished += beam  # still going at the length limit: cut there

    def key(c):
        return c[2] / len(c[0]) if normalize else c[2]

    best = max(finished, key=key) if finished else None
    return [(c[0], c[2]) for c in finished], best and (best[0], best[2])
