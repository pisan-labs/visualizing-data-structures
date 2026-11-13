import heapq
import math
from collections import Counter


class InvertedIndex:
    """Term -> postings list of (document, term frequency), ranked with BM25."""

    def __init__(self):
        self.index = {}  # a hash table: term -> [(doc, tf), ...] in document order
        self.lengths = []  # words in each document; documents count from 1

    def add(self, words):
        doc = len(self.lengths) + 1
        self.lengths.append(len(words))
        for term, tf in Counter(words).items():
            self.index.setdefault(term, []).append((doc, tf))
        return doc

    def search(self, query, k1=1.2, b=0.75, idf="rsj", k=3):
        """The k best (doc, score) pairs, best first; a tie goes to the lower doc."""
        n_docs = len(self.lengths)
        total = 0
        for length in self.lengths:
            total += length
        avgdl = total / n_docs
        scores = {}
        for term in query:  # a word typed twice counts twice
            postings = self.index.get(term)
            if not postings:
                continue
            ratio = (n_docs - len(postings) + 0.5) / (len(postings) + 0.5)
            weight = math.log(ratio) if idf == "rsj" else math.log(1 + ratio)
            for doc, tf in postings:
                B = 1 - b + b * self.lengths[doc - 1] / avgdl
                scores[doc] = scores.get(doc, 0) + weight * (tf / (tf + k1 * B))
        # A heap of size k: the weakest kept on top.
        return heapq.nlargest(k, scores.items(), key=lambda item: (item[1], -item[0]))
