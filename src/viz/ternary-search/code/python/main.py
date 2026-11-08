# Test driver: "load v1 v2 ..." replaces the list; "search x" prints the index of x;
# "max" prints the index of the peak.
import sys

from ternary_search import ternary_max, ternary_search


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "search":
            print(ternary_search(a, int(parts[1])))
        elif parts[0] == "max":
            print(ternary_max(a))


main()
