# Test driver: reads one operation per line, prints one result per line.
# "pda <states>" starts a machine; "start <state>", "accept <states>",
# "stack <symbols>" (top first, nothing for an empty stack), "by state" or
# "by stack", and "move <from> <read> <pop> <to> <push>" ("eps" for nothing)
# fill it in. "run <word>" (no word for the empty word) prints "accept <moves>",
# "reject" or "stopped".
import sys

from pda import EPS, PDA


def main():
    start, accept, stack, by_stack, moves = None, [], "", False, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "pda":
            start, accept, stack, by_stack, moves = None, [], "", False, []
        elif op == "start":
            start = args[0]
        elif op == "accept":
            accept = args
        elif op == "stack":
            stack = "".join(args)
        elif op == "by":
            by_stack = args[0] == "stack"
        elif op == "move":
            q, a, x, r, push = (EPS if s == "eps" else s for s in args)
            moves.append((q, a, x, r, push))
        elif op == "run":
            m = PDA(start, accept, moves, stack, by_stack)
            result, k = m.run(args[0] if args else "")
            print(result if k is None else f"{result} {k}")


main()
