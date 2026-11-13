# Test driver: reads one operation per line, prints one result per line.
# "reset" forgets the training words; "word <count> <tokens>" adds one, already split
# (characters or bytes, with or without the marker); "known <tokens>" adds starting
# symbols that no word has (all 256 bytes). None of these print.
# "train <k> first|alpha" learns k merges from the start and "merge first|alpha" one more;
# both print the merges as a+b, or "none". "encode <tokens>" prints the tokens.
import sys

from bpe import encode, train


def main():
    start, words, merges, alphabet = {}, {}, [], set()
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "reset":
            start, words, merges, alphabet = {}, {}, [], set()
        elif op == "word":
            start[tuple(args[1:])] = int(args[0])
            words = dict(start)
            alphabet.update(args[1:])
        elif op == "known":
            alphabet.update(args)
        elif op == "train":
            merges, words = train(start, int(args[0]), args[1] == "alpha")
            print(" ".join(f"{a}+{b}" for a, b in merges) or "none")
        elif op == "merge":
            more, words = train(words, 1, args[0] == "alpha")
            merges += more
            print(" ".join(f"{a}+{b}" for a, b in more) or "none")
        elif op == "encode":
            print(" ".join(encode(args, merges, alphabet)))


main()
