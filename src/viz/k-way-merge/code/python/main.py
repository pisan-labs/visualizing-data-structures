# Test driver: "merge 1 8 12 | 3 4 10 | 2 9" prints the merged list.
import sys

from k_way_merge import merge_lists


def main():
    for line in sys.stdin:
        parts = line.split(maxsplit=1)
        if not parts or parts[0] != "merge":
            continue
        lists = [[int(x) for x in p.split()] for p in parts[1].split("|")]
        print(*merge_lists(lists))


main()
