def select_activities(activities):
    """The most activities that do not overlap, by earliest finish first.

    activities is a list of (start, finish) pairs, half-open: [start, finish).
    Returns their numbers (from 1) in the order they are chosen.
    """
    order = sorted(range(len(activities)), key=lambda k: activities[k][1])
    chosen = []
    last = float("-inf")
    for k in order:
        start, finish = activities[k]
        if start >= last:
            chosen.append(k + 1)
            last = finish
    return chosen
