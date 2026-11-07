# Test driver: reads one operation per line, prints one result per line.
# Each "dfa <states>" line starts a machine: the first is A, the next B, then A again.
import sys

from product import DFA, product


def name(pair):
    return f"{pair[0]},{pair[1]}"


def main():
    machines = [None, None]
    which = 1
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        m = machines[which]
        if op == "dfa":
            which = 1 - which
            machines[which] = DFA(args, [], None, [], {})
        elif op == "alphabet":
            m.alphabet = args
        elif op == "start":
            m.start = args[0]
        elif op == "accept":
            m.accept = set(args)
        elif op == "move":
            m.delta[(args[0], args[1])] = args[2]
        elif op == "complement":
            i = 0 if args[0] == "A" else 1
            machines[i] = machines[i].complement()
            acc = " ".join(sorted(machines[i].accept)) or "-"
            print(f"states {len(machines[i].states)} | accept {acc}")
        elif op == "build":
            P = product(machines[0], machines[1], args[0])
            states = " ".join(name(r) for r in P.states)
            acc = " ".join(name(r) for r in P.states if r in P.accept) or "-"
            moves = " ".join(
                f"{name(r)}-{c}->{name(P.delta[(r, c)])}" for r in P.states for c in P.alphabet
            )
            print(f"{states} | accept {acc} | {moves or '-'}")
        elif op == "run":
            P = product(machines[0], machines[1], args[0])
            r = P.start
            for c in args[1] if len(args) > 1 else "":
                r = P.delta[(r, c)]
            print("accept" if r in P.accept else "reject", name(r))


main()
