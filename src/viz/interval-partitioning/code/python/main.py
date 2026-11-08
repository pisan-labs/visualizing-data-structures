# Test driver: "rooms s1-f1 s2-f2 ..." prints the number of rooms, then each lecture's room in
# the order typed.
import sys

from rooms import assign_rooms


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2 or parts[0] != "rooms":
            continue
        lectures = [tuple(map(int, p.split("-"))) for p in parts[1:]]
        rooms, room = assign_rooms(lectures)
        print(" ".join(map(str, [rooms] + room)))


main()
