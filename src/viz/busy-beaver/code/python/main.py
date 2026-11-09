# Test driver: reads one operation per line, prints one result per line.
#   load <rules>   loads a machine such as 1RB1LB_1LA1RH on a blank tape (prints nothing)
#   reset          a blank tape again (prints nothing)
#   run <k>        makes up to k moves; prints "<state> <moves> <ones>"
import sys

from busy_beaver import BusyBeaver


def main():
    machine = None
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "load":
            machine = BusyBeaver(arg)
        elif op == "reset":
            machine.reset()
        elif op == "run":
            machine.run(int(arg))
            print(machine.state, machine.moves, len(machine.ones))


main()
