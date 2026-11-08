# Test driver: reads one operation per line, prints one result per line.
import sys

from segments import any_segments_intersect


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "segments":
            continue
        n = [int(t) for t in parts[1:]]
        segs = [((n[i], n[i + 1]), (n[i + 2], n[i + 3])) for i in range(0, len(n), 4)]
        out.append("yes" if any_segments_intersect(segs) else "no")
    sys.stdout.write("".join(line + "\n" for line in out))


main()
