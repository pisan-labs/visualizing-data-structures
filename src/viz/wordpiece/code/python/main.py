# Test driver: reads one operation per line, prints one result per line.
# "reset" forgets the training words and "word <count> <letters>" adds one; neither prints.
# "train <k>" learns k merges from the start and "merge" one more; both print the merges as
# a+b, or "none". "encode <max length> <letters>" prints the pieces.
import sys

from wordpiece import build_trie, encode, join, split, train


def main():
    start, words, merges = {}, {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "reset":
            start, words, merges = {}, {}, []
        elif op == "word":
            start[split("".join(args[1:]))] = int(args[0])
            words = dict(start)
        elif op == "train":
            merges, words = train(start, int(args[0]))
            print(" ".join(f"{a}+{b}" for a, b in merges) or "none")
        elif op == "merge":
            more, words = train(words, 1)
            merges += more
            print(" ".join(f"{a}+{b}" for a, b in more) or "none")
        elif op == "encode":
            vocab = {p for w in start for p in w} | {join(a, b) for a, b in merges}
            print(" ".join(encode("".join(args[1:]), build_trie(vocab), int(args[0]))))


main()
