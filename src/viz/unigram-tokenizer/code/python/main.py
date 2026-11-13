# Test driver: reads one operation per line, prints one result per line.
# "text <word> <count> ..." sets the training words (no output). "seed <size>" builds the seed
# vocabulary and prints its pieces of two or more letters. "encode <word>" prints the best split,
# a bar, and its log-probability. "prune <floor>" prints the pieces one round removes, or "-".
import math
import sys

from unigram import log_probs, prune, seed_vocab, viterbi


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    words, vocab = [], {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "text":
            words = [(args[i], int(args[i + 1])) for i in range(0, len(args), 2)]
        elif op == "seed":
            vocab = seed_vocab(words, int(args[0]))
            print(" ".join(x for x in vocab if len(x) > 1) or "-")
        elif op == "encode":
            pieces, score = viterbi(args[0], log_probs(vocab))
            print(" ".join(pieces), "|", three(score))
        elif op == "prune":
            print(" ".join(prune(words, vocab, int(args[0]))) or "-")


main()
