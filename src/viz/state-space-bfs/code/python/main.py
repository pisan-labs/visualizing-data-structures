# Test driver: "lock goal b1 b2 ..." prints the fewest turns from all zeros to goal, never
# showing a barred combination; "words goal w1 w2 ..." prints the fewest one-letter changes
# from w1 to goal through the list. Both print -1 when the goal cannot be reached.
import sys

from state_bfs import lock_moves, word_moves


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        cmd, goal, rest = parts[0], parts[1], parts[2:]
        if cmd == "lock":
            print(lock_moves(rest, goal))
        elif cmd == "words":
            print(word_moves(rest, goal))


main()
