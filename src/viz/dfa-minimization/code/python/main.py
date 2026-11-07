# Test driver: reads one operation per line, prints one result per line.
# "dfa <states>" starts a DFA; the states come in name order. "minimize" prints the blocks.
import sys

from minimize import minimize


def main():
    names, alphabet, start, accept, moves = [], [], None, [], []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "dfa":
            names, alphabet, start, accept, moves = args, [], None, [], []
        elif op == "alphabet":
            alphabet = args
        elif op == "start":
            start = args[0]
        elif op == "accept":
            accept = args
        elif op == "move":
            moves.append(args)
        elif op == "minimize":
            index = {q: i for i, q in enumerate(names)}
            delta = [[None] * len(alphabet) for _ in names]
            for p, c, q in moves:
                delta[index[p]][alphabet.index(c)] = index[q]
            blocks, arrows = minimize(delta, index[start], {index[q] for q in accept})
            dead, i = "dead", 2
            while dead in index:
                dead, i = f"dead{i}", i + 1
            name = lambda q: names[q] if q < len(names) else dead
            number = {q: b + 1 for b, members in enumerate(blocks) for q in members}
            print(
                " ".join(
                    f"{b + 1}={{{','.join(name(q) for q in members)}}}"
                    for b, members in enumerate(blocks)
                ),
                "| start",
                number[index[start]],
                "| accept",
                " ".join(
                    str(b + 1)
                    for b, members in enumerate(blocks)
                    if members[0] < len(names) and name(members[0]) in accept
                )
                or "-",
                "|",
                " ".join(
                    f"{b + 1}-{c}->{row[j] + 1}"
                    for b, row in enumerate(arrows)
                    for j, c in enumerate(alphabet)
                )
                or "-",
            )


main()
