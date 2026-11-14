# Test driver: "follow <cue>" prints the pattern the cue points to ("none" if the words
# are not a cue); "family <name>" prints the family's patterns, separated by spaces.
import sys

from pattern_map import family, follow


def main():
    for line in sys.stdin:
        cmd, _, arg = line.rstrip("\r\n").partition(" ")
        if cmd == "follow":
            print(follow(arg) or "none")
        elif cmd == "family":
            print(" ".join(family(arg)) or "none")


main()
