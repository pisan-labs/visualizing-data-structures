MINRUN = 4  # real Timsort picks 32 to 64 from len(a)


def timsort(a):
    """Sort the list a in place, stably: find natural runs, grow short ones
    to MINRUN with binary insertion sort, and merge them off a stack that
    keeps |Z| > |Y| + |X| and |Y| > |X| (X on top)."""
    n, lo, stack = len(a), 0, []
    while lo < n:
        end = _run_end(a, lo)
        if end - lo < MINRUN and end < n:
            end = min(lo + MINRUN, n)
            _binary_insertion_sort(a, lo, end)
        stack.append((lo, end - lo))
        lo = end
        _collapse(a, stack)
    while len(stack) > 1:
        i = len(stack) - 2
        if i > 0 and stack[i - 1][1] < stack[i + 1][1]:
            i -= 1
        _merge_at(a, stack, i)


def _run_end(a, lo):
    """End (exclusive) of the natural run at a[lo]; a falling run is reversed."""
    end = lo + 1
    if end == len(a):
        return end
    if a[end] < a[lo]:  # strictly falling
        while end + 1 < len(a) and a[end + 1] < a[end]:
            end += 1
        a[lo:end + 1] = a[lo:end + 1][::-1]
    else:
        while end + 1 < len(a) and a[end + 1] >= a[end]:
            end += 1
    return end + 1


def _binary_insertion_sort(a, lo, end):
    for i in range(lo + 1, end):
        key, left, right = a[i], lo, i
        while left < right:  # first place where a value > key
            mid = (left + right) // 2
            if a[mid] <= key:
                left = mid + 1
            else:
                right = mid
        a[left + 1:i + 1] = a[left:i]
        a[left] = key


def _collapse(a, stack):
    while len(stack) > 1:
        i = len(stack) - 2
        size = [r[1] for r in stack]
        if (i > 0 and size[i - 1] <= size[i] + size[i + 1]) or (
            i > 1 and size[i - 2] <= size[i - 1] + size[i]
        ):
            if size[i - 1] < size[i + 1]:
                i -= 1
        elif size[i] > size[i + 1]:
            return
        _merge_at(a, stack, i)


def _gallop_right(key, a, base, length):
    """How many of a[base:base+length] are <= key: jumps of 1, 3, 7, ...
    from the left, then binary search."""
    if a[base] > key:
        return 0
    last, ofs = 0, 1
    while ofs < length and a[base + ofs] <= key:
        last, ofs = ofs, 2 * ofs + 1
    lo, hi = last + 1, min(ofs, length)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[base + mid] <= key:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _gallop_left(key, a, base, length):
    """How many of a[base:base+length] are < key, galloping from the right."""
    if a[base + length - 1] < key:
        return length
    last, ofs = length - 1, 1
    while ofs < length and a[base + length - 1 - ofs] >= key:
        last, ofs = length - 1 - ofs, 2 * ofs + 1
    lo, hi = max(length - 1 - ofs, -1) + 1, last
    while lo < hi:
        mid = (lo + hi) // 2
        if a[base + mid] < key:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _merge_at(a, stack, i):
    (base_a, len_a), (base_b, len_b) = stack[i], stack[i + 1]
    stack[i:i + 2] = [(base_a, len_a + len_b)]
    k = _gallop_right(a[base_b], a, base_a, len_a)  # already in place
    base_a, len_a = base_a + k, len_a - k
    if len_a == 0:
        return
    len_b = _gallop_left(a[base_a + len_a - 1], a, base_b, len_b)
    tmp = a[base_a:base_a + len_a]
    i, j, k = 0, base_b, base_a
    while i < len(tmp) and j < base_b + len_b:
        if tmp[i] <= a[j]:  # ties go to the left run: stable
            a[k] = tmp[i]
            i += 1
        else:
            a[k] = a[j]
            j += 1
        k += 1
    a[k:k + len(tmp) - i] = tmp[i:]
