# Test driver: reads one operation per line, prints one result per line.
import sys

from master import T, master_case


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "case":
            out.append(master_case(*args))
        elif op == "T":
            out.append(str(T(*args)))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
