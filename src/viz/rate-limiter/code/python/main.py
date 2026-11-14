# Test driver: reads one operation per line, prints one result per line.
import sys

from rate_limiters import FixedWindow, SlidingLog, SlidingWindowCounter, TokenBucket

KINDS = {
    "fixed": FixedWindow,
    "log": SlidingLog,
    "counter": SlidingWindowCounter,
    "bucket": TokenBucket,
}


def main():
    kind, limit, window = "counter", 3, 10
    limiter = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "new":
            kind, limit, window = parts[1], int(parts[2]), int(parts[3])
            limiter = KINDS[kind](limit, window)
        elif op == "req":
            out.append("pass" if limiter.allow(int(parts[1])) else "refuse")
        elif op == "clear":
            limiter = KINDS[kind](limit, window)
            out.append("ok")
    print("\n".join(out))


main()
