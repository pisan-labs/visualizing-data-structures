# Test driver: reads one operation per line, prints one result per line.
# "clear" starts a sentence and "x q1 q2 k1 k2" adds a word's query and key; neither prints.
# "encode sinusoidal|rope|alibi" prints the encodings, the angles or the biases (ALiBi: each
# row up to the diagonal); "score sinusoidal|rope|alibi" prints PE(m)·PE(n), the turned
# q_m·k_n, or ALiBi's attention weights. Rows are separated by slashes, three decimals each.
import math
import sys

from positions import alibi_attention, angle, rope_scores, sinusoidal

D = 8  # four pairs
SLOPE = 0.5


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def rows(m):
    return " / ".join(" ".join(three(v) for v in row) for row in m)


def main():
    q, k = [], []
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        if p[0] == "clear":
            q, k = [], []
        elif p[0] == "x":
            v = [float(t) for t in p[1:]]
            q.append(v[:2] * (D // 2))  # the same pair in each of the four pairs
            k.append(v[2:] * (D // 2))
        elif p[0] == "encode":
            n = len(q)
            if p[1] == "sinusoidal":
                print(rows(sinusoidal(n, D)))
            elif p[1] == "rope":
                print(rows([[angle(pos, i, D) for i in range(D // 2)] for pos in range(n)]))
            else:
                print(rows([[-SLOPE * (i - j) for j in range(i + 1)] for i in range(n)]))
        elif p[0] == "score":
            if p[1] == "sinusoidal":
                pe = sinusoidal(len(q), D)
                print(rows([[sum(a * b for a, b in zip(r, c)) for c in pe] for r in pe]))
            elif p[1] == "rope":
                print(rows(rope_scores(q, k)))
            else:
                print(rows(alibi_attention([v[:2] for v in q], [v[:2] for v in k], SLOPE)))


main()
