"""Test driver: one command per line, one line of output per command.

    run <program> <input>               accept <steps> | reject <steps> | loop <first> <again>
    diagonal <atm|halt> <p1> ... <pn>   D: <D's entry for each program>
    reduce <atm|halt> <program> <input> S: accept|reject, or R: halts|loops
"""
import sys

from halting import d_row, r_decides_halt, run, s_decides_atm

for line in sys.stdin:
    parts = line.split()
    if not parts:
        continue
    cmd = parts[0]
    if cmd == "run":
        print(" ".join(str(x) for x in run(parts[1], parts[2])))
    elif cmd == "diagonal":
        print("D: " + " ".join(d_row(parts[2:], parts[1])))
    elif cmd == "reduce" and parts[1] == "atm":
        print("S: " + s_decides_atm(parts[2], parts[3]))
    elif cmd == "reduce":
        print("R: " + r_decides_halt(parts[2], parts[3]))
