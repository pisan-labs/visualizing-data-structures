def linear_search(a, x):
    """Return the index of the first x in a, or -1 if x is not there."""
    for i in range(len(a)):
        if a[i] == x:
            return i
    return -1
