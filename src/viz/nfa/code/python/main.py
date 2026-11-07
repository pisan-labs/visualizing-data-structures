# Test driver: reads one operation per line, prints one result per line.
# "machine <start> <states>" starts a machine, "accept <states>" and
# "move <from> <symbol> <to>" fill it in ("eps" for an epsilon-move), and
# "run <word>" (no word for the empty word) prints "accept {q0,q2}" or
# "reject {...}" with the final set in the order "machine" listed the states.
import sys

from nfa import EPS, NFA


def main():
    start, order, accept, delta = None, [], [], {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "machine":
            start, order, accept, delta = args[0], args[1:], [], {}
        elif op == "accept":
            accept = args
        elif op == "move":
            c = EPS if args[1] == "eps" else args[1]
            delta.setdefault((args[0], c), set()).add(args[2])
        elif op == "run":
            m = NFA(start, accept, delta)
            word = args[0] if args else ""
            final = m.run(word)
            shown = ",".join(q for q in order if q in final)
            print("accept" if m.accepts(word) else "reject", "{" + shown + "}")


main()
