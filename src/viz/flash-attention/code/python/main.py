# Test driver: reads one operation per line, prints one result per line.
# "clear" starts a sentence and "qkv q1 q2 k1 k2 v1 v2" adds a word's query, key and value.
# "flash kv|q br bc causal" and "plain causal" (1 or 0) print the rows of O, then m, then l,
# three decimals each, then the numbers moved: Q, K and V, O m l, the table.
import math
import sys

from flash_attention import attention, flash_attention


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def line(o, m, l, moved):
    rows = " / ".join(" ".join(three(x) for x in row) for row in o)
    return (f"{rows} | {' '.join(three(x) for x in m)} | {' '.join(three(x) for x in l)}"
            f" | {' '.join(str(x) for x in moved)}")


def main():
    q, k, v = [], [], []
    for text in sys.stdin:
        parts = text.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "clear":
            q, k, v = [], [], []
        elif op == "qkv":
            x = [float(t) for t in args]
            q.append(x[0:2])
            k.append(x[2:4])
            v.append(x[4:6])
        elif op == "flash":
            br, bc, causal = int(args[1]), int(args[2]), args[3] == "1"
            print(line(*flash_attention(q, k, v, br, bc, causal, args[0] == "q")))
        elif op == "plain":
            print(line(*attention(q, k, v, args[0] == "1")))


main()
