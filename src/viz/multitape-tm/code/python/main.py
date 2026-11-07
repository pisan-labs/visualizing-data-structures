# Test driver: reads one operation per line, prints one result per line.
#   machine <k> <start>                           starts a machine (prints nothing)
#   rule <state> <reads> <next> <writes> <moves>  adds a rule (prints nothing)
#   run <words>        prints "accept after 16 moves: 0110=0110 | $0110"
#   simulate <words>   prints "accept after 10 moves of M and 248 on one tape: #01=01[_]#..."
import sys

from multitape_tm import BLANK, MultiTapeTM


def verdict(v):
    return "still running" if v == "running" else v


def plural(n):
    return f"{n} move" if n == 1 else f"{n} moves"


def main():
    machine = None
    for line in sys.stdin:
        if not line.strip():
            continue
        op, *args = line.split()
        if op == "machine":
            machine = MultiTapeTM(int(args[0]), args[1])
        elif op == "rule":
            machine.add_rule(*args)
        elif op == "run":
            result, moves, tapes = machine.run(args[0].split(",") if args else [])
            text = " | ".join("".join(t).rstrip(BLANK) or BLANK for t in tapes)
            print(f"{verdict(result)} after {plural(moves)}: {text}")
        elif op == "simulate":
            result, moves, steps, tape, marks = machine.simulate(args[0].split(",") if args else [])
            text = "".join(f"[{a}]" if i in marks else a for i, a in enumerate(tape))
            print(f"{verdict(result)} after {plural(moves)} of M and {steps} on one tape: {text}")


main()
