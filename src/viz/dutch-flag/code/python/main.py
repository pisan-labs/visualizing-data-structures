# Test driver: "load v1 v2 ..." replaces the list; "partition p" partitions it in place and
# prints the values, then "| low high".
import sys

from three_way import three_way_partition


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "partition":
            low, high = three_way_partition(a, int(parts[1]))
            print(*a, "|", low, high)


main()
