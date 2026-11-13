# Test driver: reads one operation per line, prints one line per result.
# "settings slots policy" starts an empty server and "add name arrival prompt length" adds a
# request; neither prints. "step" runs one iteration and prints "t: <who is in each slot, - when
# idle> | <who returned, - for no one>"; "run" runs until every request is done and prints
# the lines of all those iterations joined by " / ".
import sys

from scheduler import Request, Scheduler


def line(s, ran, returned):
    slots = " ".join(r.name if r else "-" for r in ran)
    back = " ".join(sorted(r.name for r in returned)) or "-"
    return f"{s.clock - 1}: {slots} | {back}"


def main():
    s = None
    for text in sys.stdin:
        parts = text.split()
        if not parts:
            continue
        op = parts[0]
        if op == "settings":
            s = Scheduler(int(parts[1]), parts[2])
        elif op == "add":
            s.add(Request(parts[1], int(parts[2]), int(parts[3]), int(parts[4])))
        elif op == "step":
            print(line(s, *s.step()))
        elif op == "run":
            lines = []
            while s.busy():
                lines.append(line(s, *s.step()))
            print(" / ".join(lines))


main()
