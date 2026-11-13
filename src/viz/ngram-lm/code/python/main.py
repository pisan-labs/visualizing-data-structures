# Test driver: reads one operation per line, prints one result per line.
# "model n k" starts a model and "train <words>" adds a sentence (no output). "count" prints
# the n-grams counted and how many differ; "counts <context>" the tokens seen after it with
# their counts; "next <context>" every token with a probability above 0; "generate u1 u2 ..."
# the tokens drawn; "score <words>" the perplexity, or inf.
import math
import sys

from ngram import NgramModel


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    model = NgramModel()
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "model":
            model = NgramModel(int(args[0]), float(args[1]))
        elif op == "train":
            model.train(" ".join(args))
        elif op == "count":
            distinct = 0
            for row in model.counts.values():
                distinct += len(row)
            print(sum(model.totals.values()), distinct)
        elif op == "counts":
            row = model.counts.get(tuple(args), {})
            seen = sorted(row.items(), key=lambda wc: (-wc[1], wc[0]))
            print(" ".join(f"{w} {c}" for w, c in seen) or "none")
        elif op == "next":
            print(" ".join(f"{w} {three(p)}" for w, p in model.next_words(args)) or "none")
        elif op == "generate":
            print(" ".join(model.generate([float(u) for u in args])))
        elif op == "score":
            pp = model.perplexity(" ".join(args))
            print("inf" if pp == math.inf else three(pp))


main()
