# Test driver: "load v1 v2 ..." replaces the list; "max k" prints the maximum of every
# window of k values; "min k" prints every window's minimum.
import sys

from monotonic_queue import window_max, window_min


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a = [int(x) for x in parts[1:]]
        elif cmd == "max":
            print(*window_max(a, int(parts[1])))
        elif cmd == "min":
            print(*window_min(a, int(parts[1])))


main()
