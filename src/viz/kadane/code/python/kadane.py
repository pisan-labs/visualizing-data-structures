def max_subarray(a, allow_empty=False):
    """The largest sum of a subarray of a, with its ends: (best, lo, hi). One pass, O(n).

    A subarray has at least one value, unless allow_empty: then the empty one, (0, 0, -1),
    counts too. Of two with the same sum, the one that starts first wins.
    """
    best, lo, hi = (0, 0, -1) if allow_empty else (float("-inf"), 0, 0)
    run = start = 0  # run: the best sum of a subarray ending here, starting at start
    for j, x in enumerate(a):
        if run < 0:  # the run so far only drags x down: restart here
            run, start = 0, j
        run += x
        if run > best:
            best, lo, hi = run, start, j
    return best, lo, hi
