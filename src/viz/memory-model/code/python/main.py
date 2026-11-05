# Test driver: reads one statement per line and prints the variables after each one.
import re
import sys

from aliasing import bump, grow, reset

FUNCTIONS = {"grow": grow, "reset": reset, "bump": bump}


def show(env):
    if not env:
        return "(empty)"
    fmt = lambda v: "[" + ",".join(map(str, v)) + "]" if isinstance(v, list) else str(v)
    return " ".join(f"{name}={fmt(v)}" for name, v in env.items())


def main():
    env = {}
    out = []
    for line in sys.stdin:
        s = line.strip()
        if not s:
            continue
        if s == "clear":
            env.clear()
        elif m := re.fullmatch(r"(\w+)\.append\((-?\d+)\)", s):
            env[m[1]].append(int(m[2]))
        elif m := re.fullmatch(r"(\w+)\[(\d+)\] = (-?\d+)", s):
            env[m[1]][int(m[2])] = int(m[3])
        elif m := re.fullmatch(r"(\w+)\((\w+)\)", s):
            FUNCTIONS[m[1]](env[m[2]])
        elif m := re.fullmatch(r"(\w+) = \[(.*)\]", s):
            env[m[1]] = [int(x) for x in m[2].split(", ") if x]
        elif m := re.fullmatch(r"(\w+) = (-?\d+)", s):
            env[m[1]] = int(m[2])
        elif m := re.fullmatch(r"(\w+) = (\w+)", s):
            env[m[1]] = env[m[2]]  # copies the reference
        out.append(show(env))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
