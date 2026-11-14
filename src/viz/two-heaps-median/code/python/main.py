# Test driver: "add x" adds a value; "median" prints the median (a whole number when it is
# one); "lower" prints the lower median; "clear" starts again.
import sys

from running_median import RunningMedian


def main():
    rm = RunningMedian()
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "add":
            rm.add(int(parts[1]))
        elif cmd == "median":
            m = rm.median()
            print(int(m) if m == int(m) else m)
        elif cmd == "lower":
            print(rm.lower_median())
        elif cmd == "clear":
            rm = RunningMedian()


main()
