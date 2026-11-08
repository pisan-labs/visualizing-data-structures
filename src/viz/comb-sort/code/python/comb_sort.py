def comb_sort(a):
    """Sort the list a in place, smallest first.

    Bubble sort with a gap: compare values gap apart, and shrink the gap
    by a factor of 1.3 after every pass. Once the gap is 1, keep making
    passes until one makes no swap.
    """
    gap = len(a)
    done = False
    while not done:
        gap = gap * 10 // 13  # floor(gap / 1.3), in whole numbers
        if gap <= 1:
            gap = 1
            done = True  # unless this pass swaps something
        for i in range(len(a) - gap):
            if a[i] > a[i + gap]:
                a[i], a[i + gap] = a[i + gap], a[i]
                done = False
