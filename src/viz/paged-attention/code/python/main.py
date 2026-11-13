# Test driver: reads one operation per line, prints one line per result.
# "settings blocks size sharing" starts an empty pool (sharing 1 or 0) and prints nothing.
# "add n", "step", "finish X" and "fork X" each print every block table, the free list
# (top first) and how many blocks have been copied.
import sys

from block_manager import BlockManager

MAX_LEN = 16
NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def state_line(m):
    tables = " / ".join(f"{name} {' '.join(map(str, t))}" for name, t in m.tables.items())
    free = " ".join(map(str, reversed(m.free))) or "-"
    return f"{tables or '-'} | free {free} | copies {m.copies}"


def main():
    m, named = None, 0
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "settings":
            blocks, size, sharing = int(parts[1]), int(parts[2]), parts[3] == "1"
            m, named = BlockManager(blocks, size, MAX_LEN, sharing), 0
            continue
        if op == "add":
            m.add(NAMES[named], int(parts[1]))
            named += 1
        elif op == "step":
            m.step()
        elif op == "finish":
            m.finish(parts[1])
        elif op == "fork":
            m.fork(parts[1], NAMES[named])
            named += 1
        print(state_line(m))


main()
