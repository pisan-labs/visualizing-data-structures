# Test driver: reads one operation per line, prints one result per line.
# "w q|k|v rows cols <values>" sets a weight matrix. "settings window cache" sets the window
# (0 keeps every token) and the cache (1 on, 0 off). "prefill <4 numbers per token>" starts a
# new text and "decode <4 numbers>" adds a token. Each prints the outputs (prefill: one per
# prompt token, separated by " / "), a bar, and how many rows the cache holds.
import math
import sys

from kv_cache import KVCache, decode_without_cache


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def rows(m):
    return " / ".join(" ".join(three(v) for v in row) for row in m)


def main():
    w, xs, cache, window, use_cache = {}, [], None, 0, True
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "w":
            r, c = int(args[1]), int(args[2])
            vals = [float(t) for t in args[3:]]
            w[args[0]] = [vals[i * c:(i + 1) * c] for i in range(r)]
        elif op == "settings":
            window, use_cache = int(args[0]), args[1] == "1"
        elif op == "prefill":
            vals = [float(t) for t in args]
            xs = [vals[i:i + 4] for i in range(0, len(vals), 4)]
            cache = KVCache(w["q"], w["k"], w["v"], window)
            z = cache.prefill(xs)
            if not use_cache:
                cache = None  # nothing is kept
            print(rows(z), "|", len(cache.keys) if cache else 0)
        elif op == "decode":
            x = [float(t) for t in args]
            xs.append(x)
            if cache:
                z = cache.decode(x)
            else:
                z = decode_without_cache(xs, w["q"], w["k"], w["v"], window)
            print(rows([z]), "|", len(cache.keys) if cache else 0)


main()
