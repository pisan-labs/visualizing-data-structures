def gnome_sort(a):
    """Sort the list a in place, smallest first.

    One index walks the list. If the value on its left is no bigger, step
    forward; otherwise swap the two and step back.
    """
    pos = 0
    while pos < len(a):
        if pos == 0 or a[pos - 1] <= a[pos]:
            pos += 1
        else:
            a[pos - 1], a[pos] = a[pos], a[pos - 1]
            pos -= 1
