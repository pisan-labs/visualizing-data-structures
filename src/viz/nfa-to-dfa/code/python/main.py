# Test driver: reads one operation per line, prints one result per line.
# "nfa <states>" starts an NFA; the states come in name order. "convert" prints the DFA.
import sys

from subsets import subset_construction


def letter(i):
    """A, B, ..., Z, then A1, B1, ..."""
    return chr(65 + i % 26) + (str(i // 26) if i >= 26 else "")


def main():
    names, alphabet, start, accept, moves = [], [], None, set(), {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "nfa":
            names, alphabet, start, accept, moves = args, [], None, set(), {}
        elif op == "alphabet":
            alphabet = args
        elif op == "start":
            start = args[0]
        elif op == "accept":
            accept = set(args)
        elif op == "move":
            moves.setdefault((args[0], args[1]), []).append(args[2])
        elif op == "convert":
            sets, delta, accepting = subset_construction(moves, alphabet, start, accept)
            order = {q: i for i, q in enumerate(names)}
            states = [
                letter(i) + "={" + ",".join(sorted(T, key=order.get)) + "}"
                for i, T in enumerate(sets)
            ]
            arrows = [
                f"{letter(i)}-{c}->{letter(row[c])}" for i, row in enumerate(delta) for c in alphabet
            ]
            print(
                " ".join(states),
                "| accept",
                " ".join(letter(i) for i in accepting) or "-",
                "|",
                " ".join(arrows) or "-",
            )


main()
