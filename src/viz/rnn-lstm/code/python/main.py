# Test driver: reads one operation per line, prints one result per line.
# "model rnn <w>", "model lstm" or "model lstm97" starts a new sentence;
# "x <four numbers>" reads one word and prints h and the pull (RNN), or
# f i g c o h and the pull (LSTM), three decimals each.
import math
import sys

from recurrent import Recurrent


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    net = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "model":
            w = float(parts[2]) if len(parts) > 2 else 0.8
            net = Recurrent(parts[1], w)
        elif parts[0] == "x":
            print(" ".join(three(v) for v in net.read([float(t) for t in parts[1:]])))


main()
