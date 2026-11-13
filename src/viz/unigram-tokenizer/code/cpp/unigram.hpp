// A unigram tokenizer: a seed vocabulary, the best split by Viterbi, and one pruning round.
#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <string>
#include <utility>
#include <vector>

const std::string UNK = "[UNK]";
const double EPS = 1e-9;  // scores closer than this count as equal: the first one found wins

struct Text {
    std::vector<std::string> words;
    std::vector<int> counts;
};

// Pieces with their counts, in vocabulary order: letters A to Z, then by count.
using Vocab = std::vector<std::pair<std::string, int>>;

// Every letter, plus the `size` most frequent substrings of 2+ letters seen at least twice.
inline Vocab seed_vocab(const Text& text, int size) {
    std::map<std::string, int> letters;
    std::vector<std::string> order;  // substrings in order of first appearance
    std::map<std::string, int> subs;
    for (size_t w = 0; w < text.words.size(); w++) {
        const std::string& word = text.words[w];
        for (size_t i = 0; i < word.size(); i++) {
            letters[word.substr(i, 1)] += text.counts[w];
            for (size_t j = i + 2; j <= word.size(); j++) {
                std::string s = word.substr(i, j - i);
                if (!subs.count(s)) order.push_back(s);
                subs[s] += text.counts[w];
            }
        }
    }
    std::vector<std::string> common;
    for (const auto& s : order)
        if (subs[s] >= 2) common.push_back(s);
    std::stable_sort(common.begin(), common.end(), [&](const std::string& a, const std::string& b) {
        return subs[a] != subs[b] ? subs[a] > subs[b] : a.size() > b.size();
    });
    Vocab vocab(letters.begin(), letters.end());
    for (size_t k = 0; k < common.size() && static_cast<int>(k) < size; k++)
        vocab.emplace_back(common[k], subs[common[k]]);
    return vocab;
}

// log p(x) = log(count(x) / total count).
inline std::map<std::string, double> log_probs(const Vocab& vocab) {
    long long total = 0;
    for (const auto& [x, c] : vocab) total += c;
    std::map<std::string, double> logp;
    for (const auto& [x, c] : vocab) logp[x] = std::log(static_cast<double>(c) / total);
    return logp;
}

struct Split {
    std::vector<std::string> pieces;
    double score;
};

// The most probable split of word and its log-probability. best[j] is the best score of the
// first j letters; a letter the vocabulary lacks becomes [UNK], 10 below the rarest piece.
inline Split viterbi(const std::string& word, const std::map<std::string, double>& logp,
                     const std::string& skip = "") {
    double unk = 0;
    for (const auto& [x, lp] : logp) unk = std::min(unk, lp);
    unk -= 10;
    size_t n = word.size();
    std::vector<double> best(n + 1, -std::numeric_limits<double>::infinity());
    std::vector<size_t> from(n + 1, 0);
    std::vector<std::string> piece(n + 1);
    best[0] = 0;
    for (size_t j = 1; j <= n; j++) {
        for (size_t i = 0; i < j; i++) {  // the longest piece ending at j first
            std::string x = word.substr(i, j - i);
            auto it = logp.find(x);
            double lp;
            if (it != logp.end() && x != skip) {
                lp = it->second;
            } else if (j == i + 1 && it == logp.end()) {
                x = UNK;
                lp = unk;
            } else {
                continue;
            }
            if (best[i] + lp > best[j] + EPS) {
                best[j] = best[i] + lp;
                from[j] = i;
                piece[j] = x;
            }
        }
    }
    Split s{{}, best[n]};
    for (size_t j = n; j > 0; j = from[j]) s.pieces.insert(s.pieces.begin(), piece[j]);
    return s;
}

// One round: remove the cheapest fifth of the pieces of 2+ letters, never going below floor.
// A piece's loss is how much the text's log-likelihood drops without it.
inline std::vector<std::string> prune(const Text& text, Vocab& vocab, int floor) {
    auto logp = log_probs(vocab);
    std::vector<Split> now;
    for (const auto& w : text.words) now.push_back(viterbi(w, logp));
    struct Loss {
        std::string x;
        size_t rank;
        double loss;
    };
    std::vector<Loss> losses;
    for (size_t rank = 0; rank < vocab.size(); rank++) {
        const std::string& x = vocab[rank].first;
        if (x.size() < 2) continue;  // letters always stay
        double loss = 0;
        for (size_t w = 0; w < text.words.size(); w++) {
            const auto& p = now[w].pieces;
            if (std::find(p.begin(), p.end(), x) != p.end())
                loss += text.counts[w] * (now[w].score - viterbi(text.words[w], logp, x).score);
        }
        losses.push_back({x, rank, loss});
    }
    int n = static_cast<int>(losses.size());
    int remove = std::max(0, std::min(n - static_cast<int>(n * 0.8), n - floor));
    std::vector<std::string> removed;
    for (int r = 0; r < remove; r++) {
        size_t k = 0;
        for (size_t i = 1; i < losses.size(); i++) {
            const Loss& a = losses[i];
            const Loss& b = losses[k];
            if (a.loss < b.loss - EPS || (std::fabs(a.loss - b.loss) <= EPS && a.rank > b.rank))
                k = i;
        }
        removed.push_back(losses[k].x);
        losses.erase(losses.begin() + static_cast<long>(k));
    }
    for (const auto& x : removed)
        vocab.erase(std::find_if(vocab.begin(), vocab.end(),
                                 [&](const auto& e) { return e.first == x; }));
    return removed;
}
