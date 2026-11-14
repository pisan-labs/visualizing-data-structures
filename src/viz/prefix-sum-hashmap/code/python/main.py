# Test driver: "load v1 v2 ..." replaces the list; "count k" prints how many subarrays sum
# to k; "longest k" prints "length start" of the longest one ("0 -1" for none).
import sys

from prefix_sums import count_sum_k, longest_sum_k


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a = [int(x) for x in parts[1:]]
        elif cmd == "count":
            print(count_sum_k(a, int(parts[1])))
        elif cmd == "longest":
            print(*longest_sum_k(a, int(parts[1])))


main()
