# Test driver: reads one operation per line, prints one result per line.
# "mealy <states>" or "moore <states>" starts a machine; "start <state>",
# "out <state> <output>" (Moore) and "move <from> <symbol> <to> [<output>]"
# (the output for Mealy) fill it in; "alphabet" is not needed.
# "run <word>" prints what the machine writes ("-" for nothing), and after a
# conversion " | " and what the converted machine writes. "convert" builds
# the other kind and prints it; "back" converts that one in turn.
import sys

from machines import Mealy, Moore, mealy_to_moore, moore_to_mealy


def convert(m):
    return moore_to_mealy(m) if isinstance(m, Moore) else mealy_to_moore(m)


def show(m):
    if isinstance(m, Moore):
        states = " ".join(f"{q}/{m.out[q]}" for q in sorted(m.out))
        moves = " ".join(f"{p}-{c}->{q}" for (p, c), q in sorted(m.delta.items()))
        return f"moore start={m.start} | {states} | {moves}"
    moves = " ".join(
        f"{p}-{c}/{m.out[(p, c)]}->{q}" for (p, c), q in sorted(m.delta.items())
    )
    return f"mealy start={m.start} | {moves}"


def main():
    machine = result = None
    kind, states, start, delta, out = None, [], None, {}, {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op in ("mealy", "moore"):
            kind, states, start, delta, out = op, args, None, {}, {}
            machine = result = None
        elif op == "start":
            start = args[0]
        elif op == "out":
            out[args[0]] = args[1]
        elif op == "move":
            delta[(args[0], args[1])] = args[2]
            if len(args) > 3:
                out[(args[0], args[1])] = args[3]
        elif op in ("run", "convert", "back"):
            if machine is None:
                make = Moore if kind == "moore" else Mealy
                machine = make(states, start, delta, out)
            if op == "run":
                word = args[0] if args else ""
                line = machine.run(word) or "-"
                if result is not None:
                    line += " | " + (result.run(word) or "-")
                print(line)
            else:
                if op == "back":
                    machine = result
                result = convert(machine)
                print(show(result))


main()
