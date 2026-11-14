# Test driver: "most s-f ..." prints the most intervals open at once; "skyline s-f:h ..."
# prints the skyline's key points as x,h separated by spaces.
import sys

from sweep import most_open, skyline


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd, rest = parts[0], parts[1:]
        if cmd == "most":
            print(most_open([tuple(int(t) for t in tok.split("-")) for tok in rest]))
        elif cmd == "skyline":
            buildings = []
            for tok in rest:
                span, height = tok.split(":")
                left, right = span.split("-")
                buildings.append((int(left), int(right), int(height)))
            print(" ".join(f"{x},{h}" for x, h in skyline(buildings)))


main()
