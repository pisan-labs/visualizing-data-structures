# Test driver: reads one operation per line, prints one result per line.
# "dfa <states>" starts a DFA (states in name order, the order they are ripped in), then
# "alphabet", "start", "accept" and "move p c q" lines. "convert" prints the expression.
import sys

from state_elimination import to_regex


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    states, start, accept, moves = [], None, [], []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "dfa":
            states, start, accept, moves = args, None, [], []
        elif op == "start":
            start = args[0]
        elif op == "accept":
            accept = args
        elif op == "move":
            moves.append(tuple(args))
        elif op == "convert":
            print(to_regex(states, start, accept, moves))


main()
