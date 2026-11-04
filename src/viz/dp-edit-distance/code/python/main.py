# Test driver: "dist a b ins del sub" prints the edit distance; "align a b ins del sub" prints
# the distance and the edits (M match, S substitute, D delete, I insert) from left to right.
import sys

from edit_distance import alignment, edit_distance


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 6:
            continue
        op, a, b = parts[:3]
        ins, dele, sub = map(int, parts[3:])
        if op == "dist":
            print(edit_distance(a, b, ins, dele, sub))
        elif op == "align":
            print(edit_distance(a, b, ins, dele, sub), alignment(a, b, ins, dele, sub))


main()
