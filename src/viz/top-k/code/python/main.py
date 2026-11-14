# Test driver: "load v1 v2 ..." replaces the list; "top k" prints the k largest from largest
# down; "kth k" prints the k-th largest.
import sys

from top_k import kth_largest, top_k


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a = [int(x) for x in parts[1:]]
        elif cmd == "top":
            print(*sorted(top_k(a, int(parts[1])), reverse=True))
        elif cmd == "kth":
            print(kth_largest(a, int(parts[1])))


main()
