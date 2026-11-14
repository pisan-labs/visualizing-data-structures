# Test driver: "merge s-f ..." prints the merged list; "insert x s-f ..." inserts x into the
# list; "intersect s-f ... | s-f ..." prints what two lists have in common. Each prints its
# intervals as s-f separated by spaces, or "none".
import sys

from intervals import insert, intersect, merge


def read(tokens):
    return [[int(t) for t in tok.split("-")] for tok in tokens]


def show(ivs):
    return " ".join(f"{s}-{f}" for s, f in ivs) or "none"


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd, rest = parts[0], parts[1:]
        if cmd == "merge":
            print(show(merge(read(rest))))
        elif cmd == "insert":
            print(show(insert(read(rest[1:]), read(rest[:1])[0])))
        elif cmd == "intersect":
            bar = rest.index("|")
            print(show(intersect(read(rest[:bar]), read(rest[bar + 1 :]))))


main()
