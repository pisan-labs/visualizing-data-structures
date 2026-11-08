# Test driver: "select s1-f1 s2-f2 ..." prints how many activities earliest finish first
# chooses, then their numbers in the order chosen.
import sys

from activities import select_activities


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2 or parts[0] != "select":
            continue
        acts = [tuple(map(int, p.split("-"))) for p in parts[1:]]
        chosen = select_activities(acts)
        print(" ".join(map(str, [len(chosen)] + chosen)))


main()
