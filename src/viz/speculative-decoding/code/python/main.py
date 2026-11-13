# Test driver: reads one operation per line, prints one result per line.
# "s <sentence>" adds a training sentence (no output). "round <k> <greedy|sample> <prefix ...> |
# <u ...>" runs one round with a bigram draft and a trigram target (the bigram where the trigram
# never saw the context) and prints the drafts accepted, a bar, and the words added.
import sys

from speculative import ngram_model, speculative_step


def main():
    sentences = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "s":
            sentences.append(" ".join(parts[1:]))
        elif parts[0] == "round":
            bigram, trigram = ngram_model(sentences, 2), ngram_model(sentences, 3)
            bar = parts.index("|")
            k, mode, prefix = int(parts[1]), parts[2], parts[3:bar]
            us = iter(float(u) for u in parts[bar + 1 :])
            n, words = speculative_step(
                prefix,
                k,
                bigram,
                lambda w: trigram(w) or bigram(w),
                us,
                mode == "greedy",
            )
            print(n, "|", " ".join(words))


main()
