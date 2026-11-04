# Test driver: reads "reverse s" or "swap s", one per line, and prints each reversed string.
import sys

from reverse import reverse, reverse_in_place


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, s = parts[0], parts[1]
        if op == "reverse":
            print(reverse(s))
        elif op == "swap":
            a = list(s)
            reverse_in_place(a, 0, len(a) - 1)
            print("".join(a))


main()
