# Test driver: "load v1 v2 ..." replaces the sorted list. "search x", "first x", "lower x",
# "upper x" and "locate x" print what that function returns.
import sys

from binary_search import first, locate, lower_bound, search, upper_bound

QUERIES = {
    "search": search,
    "first": first,
    "lower": lower_bound,
    "upper": upper_bound,
    "locate": locate,
}


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] in QUERIES:
            print(QUERIES[parts[0]](a, int(parts[1])))


main()
