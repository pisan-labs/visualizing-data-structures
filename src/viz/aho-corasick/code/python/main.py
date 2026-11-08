# Test driver: "search P1,P2,... T" prints every match as start:word,
# separated by spaces, in the order the scan finds them, or "none".
import sys

from aho_corasick import AhoCorasick


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) == 3 and parts[0] == "search":
            found = AhoCorasick(parts[1].split(",")).search(parts[2])
            print(" ".join(f"{s}:{w}" for s, w in found) if found else "none")


main()
