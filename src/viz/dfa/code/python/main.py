# Test driver: reads one operation per line, prints one result per line.
# "machine <start> <states>" starts a machine, "accept <states>" and
# "move <from> <symbol> <to>" fill it in, and "run <word>" (no word for the
# empty word) prints "accept <end state>", "reject <end state>" or "reject none".
import sys

from dfa import DFA


def main():
    start, accept, delta = None, [], {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "machine":
            start, accept, delta = args[0], [], {}
        elif op == "accept":
            accept = args
        elif op == "move":
            delta[(args[0], args[1])] = args[2]
        elif op == "run":
            m = DFA(start, accept, delta)
            word = args[0] if args else ""
            q = m.run(word)
            print("accept" if m.accepts(word) else "reject", q or "none")


main()
