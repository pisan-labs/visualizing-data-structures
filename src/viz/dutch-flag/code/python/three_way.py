def three_way_partition(a, p):
    """Rearrange a in place: values below p, then values equal to p, then values above p.
    One pass, O(1) extra space. Returns (low, high): a[low..high] holds the values equal
    to p (none when low > high)."""
    low, mid, high = 0, 0, len(a) - 1
    while mid <= high:  # a[mid..high] is still unknown
        if a[mid] < p:
            a[low], a[mid] = a[mid], a[low]  # a[low] was a p (or is a[mid] itself)
            low += 1
            mid += 1
        elif a[mid] > p:
            a[mid], a[high] = a[high], a[mid]  # the value that comes to mid is unknown
            high -= 1
        else:
            mid += 1
    return low, high
