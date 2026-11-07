# Test driver: reads one operation per line, prints one result per line.
#   load <rules>   loads a machine (prints nothing)
#   run <word>     prints "accept after 25 moves: xxxyyy", or reject, or still running
import sys

from turing_machine import TuringMachine


def main():
    machine = None
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "load":
            machine = TuringMachine(arg)
        elif op == "run":
            result, moves, tape = machine.run(arg.strip())
            verdict = "still running" if result == "running" else result
            unit = "move" if moves == 1 else "moves"
            print(f"{verdict} after {moves} {unit}: {tape}")


main()
