# Test driver: "load v1 v2 ..." replaces the list; "pair t" prints "lo hi" or "none";
# "water" prints the most water; "dedupe" keeps a[:k] and prints "k: a[0] ... a[k-1]";
# "reverse" reverses the list and prints it.
import sys

from two_pointers import max_water, pair_sum, remove_duplicates, reverse


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a = [int(x) for x in parts[1:]]
        elif cmd == "pair":
            found = pair_sum(a, int(parts[1]))
            print("none" if found is None else f"{found[0]} {found[1]}")
        elif cmd == "water":
            print(max_water(a))
        elif cmd == "dedupe":
            k = remove_duplicates(a)
            del a[k:]
            print(f"{k}: {' '.join(map(str, a))}")
        elif cmd == "reverse":
            reverse(a)
            print(" ".join(map(str, a)))


main()
