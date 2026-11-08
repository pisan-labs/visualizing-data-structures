# Test driver: "can T x1 x2 ..." prints true or false; "subset T x1 x2 ..." prints true and the
# numbers of a subset that adds up to T, or false.
import sys

from subset_sum import subset_sum


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        target = int(parts[1])
        found = subset_sum([int(x) for x in parts[2:]], target)
        if parts[0] == "can":
            print("true" if found is not None else "false")
        elif parts[0] == "subset":
            print("false" if found is None else " ".join(["true"] + [str(x) for x in found]))


main()
