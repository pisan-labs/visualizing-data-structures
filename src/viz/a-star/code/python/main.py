# Test driver: reads one operation per line, prints one result per line.
# "astar <4|8> <heuristic> <weight> <row> <row> ..." prints
# "<cost> <expanded> <path>" or "none <expanded>".
import sys

from astar import astar


def name(cell):
    return chr(ord("A") + cell[1]) + str(cell[0] + 1)


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "astar":
            continue
        eight, heuristic, w = parts[1] == "8", parts[2], float(parts[3])
        path, expanded = astar(parts[4:], heuristic, w, eight)
        if path is None:
            print("none", expanded)
        else:
            print(len(path) - 1, expanded, " ".join(name(p) for p in path))


main()
