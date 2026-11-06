# Test driver: reads one operation per line, prints one result per line.
# "vars <names>" starts a formula, "clause <lit> <lit>" adds (a or b), with !
# for not, and "solve" prints "UNSAT" or each variable's value: "a=T b=F".
import sys

from two_sat import two_sat


def main():
    names, index, clauses = [], {}, []

    def literal(token):
        neg = token.startswith("!")
        return 2 * index[token.lstrip("!")] + (1 if neg else 0)

    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "vars":
            names = args
            index = {name: i for i, name in enumerate(names)}
            clauses = []
        elif op == "clause":
            clauses.append((literal(args[0]), literal(args[1])))
        elif op == "solve":
            value = two_sat(len(names), clauses)
            if value is None:
                print("UNSAT")
            else:
                print(" ".join(f"{x}={'T' if v else 'F'}" for x, v in zip(names, value)))


main()
