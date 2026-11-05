# Test driver: reads one operation per line, prints one result per line.
# "bfs <4|8> <row> <row> ..." prints "<moves> <expanded> <path>" or "none <expanded>".
import sys

from grid_bfs import grid_bfs


def name(cell):
    return chr(ord("A") + cell[1]) + str(cell[0] + 1)


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "bfs":
            continue
        path, expanded = grid_bfs(parts[2:], eight=parts[1] == "8")
        if path is None:
            print("none", expanded)
        else:
            print(len(path) - 1, expanded, " ".join(name(p) for p in path))


main()
