# Test driver: reads one operation per line, prints one result per line.
# "triangle 8" prints how many times the triangle's innermost line runs for n = 8.
# "search 8 first" searches a = [1..8] for x placed first, in the middle, or missing.
import sys

import loops


def search_case(n, where):
    a = list(range(1, n + 1))
    if where == "first":
        x = a[0]
    elif where == "middle":
        x = a[(n - 1) // 2]
    else:
        x = n + 1
    return loops.search(a, x)


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        n = int(parts[1])
        if parts[0] == "search":
            out.append(str(search_case(n, parts[2])))
        elif parts[0] == "sqrt":
            out.append(str(loops.square_root(n)))
        else:
            out.append(str(getattr(loops, parts[0])(n)))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
