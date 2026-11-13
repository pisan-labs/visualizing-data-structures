import math

BOS, EOS = "<s>", "</s>"


class NgramModel:
    """An n-gram language model from counts, with add-k smoothing (k = 0: none)."""

    def __init__(self, n=2, k=0.0):
        self.n, self.k = n, k
        self.counts = {}  # context (a tuple of n - 1 tokens) -> {next token: count}
        self.totals = {}  # context -> how many tokens came after it
        self.vocab = set()  # every token that can come next, </s> included

    def pad(self, words):
        return [BOS] * (self.n - 1) + words + [EOS]

    def train(self, sentence):
        tokens = self.pad(sentence.split())
        for i in range(self.n - 1, len(tokens)):
            context, word = tuple(tokens[i - self.n + 1:i]), tokens[i]
            row = self.counts.setdefault(context, {})
            row[word] = row.get(word, 0) + 1
            self.totals[context] = self.totals.get(context, 0) + 1
            self.vocab.add(word)

    def prob(self, context, word):
        """P(word | context) = (C(context word) + k) / (C(context) + k V)."""
        context = tuple(context)
        denominator = self.totals.get(context, 0) + self.k * len(self.vocab)
        if denominator == 0:
            return 0.0  # a context never seen, and no smoothing
        return (self.counts.get(context, {}).get(word, 0) + self.k) / denominator

    def next_words(self, context):
        """Every token with a probability above 0, most likely first, ties alphabetical."""
        ps = [(w, self.prob(context, w)) for w in self.vocab]
        return sorted([(w, p) for w, p in ps if p > 0], key=lambda wp: (-wp[1], wp[0]))

    def generate(self, uniforms, max_words=10):
        """Draw tokens until </s>, using one uniform number in [0, 1) per token."""
        draws = iter(uniforms)
        context, words = [BOS] * (self.n - 1), []
        while len(words) < max_words:
            u, total = next(draws), 0.0
            for word, p in self.next_words(context):
                total += p
                if u < total:  # u lands in this word's stretch
                    break
            if word == EOS:
                return words + [EOS]
            words.append(word)
            context = (context + [word])[1:]
        return words

    def perplexity(self, sentence):
        """P(sentence) ** (-1 / N), over the N tokens after the start (</s> included)."""
        tokens = self.pad(sentence.split())
        log_prob = 0.0
        for i in range(self.n - 1, len(tokens)):
            p = self.prob(tokens[i - self.n + 1:i], tokens[i])
            if p == 0:
                return math.inf  # one unseen n-gram makes the sentence impossible
            log_prob += math.log(p)
        return math.exp(-log_prob / (len(tokens) - (self.n - 1)))
