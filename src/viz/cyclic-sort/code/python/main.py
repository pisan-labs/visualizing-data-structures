# Test driver: "load v1 v2 ..." replaces the list; "sort" sorts it with cyclic sort and prints
# the values, then "| missing | repeated" ("-" for an empty list).
import sys

from cyclic_sort import missing_and_repeated


def show(xs):
    return " ".join(map(str, xs)) if xs else "-"


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "sort":
            missing, repeated = missing_and_repeated(a)
            print(show(a), "|", show(missing), "|", show(repeated))


main()
