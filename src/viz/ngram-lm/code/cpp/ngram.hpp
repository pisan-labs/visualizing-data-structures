#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

// An n-gram language model from counts, with add-k smoothing (k = 0: none).
class NgramModel {
public:
    inline static const std::string BOS = "<s>", EOS = "</s>";

    NgramModel(int n = 2, double k = 0) : n_(n), k_(k) {}

    void train(const std::vector<std::string>& words) {
        std::vector<std::string> t = pad(words);
        for (size_t i = n_ - 1; i < t.size(); i++) {
            std::string context = join(t, i - (n_ - 1), i);
            counts[context][t[i]]++;
            totals[context]++;
            vocab.insert(t[i]);
        }
    }

    // P(word | context) = (C(context word) + k) / (C(context) + k V).
    double prob(const std::vector<std::string>& context, const std::string& word) const {
        std::string c = join(context, 0, context.size());
        auto total = totals.find(c);
        double denominator = (total == totals.end() ? 0 : total->second) + k_ * vocab.size();
        if (denominator == 0) return 0;  // a context never seen, and no smoothing
        int count = 0;
        auto row = counts.find(c);
        if (row != counts.end() && row->second.count(word)) count = row->second.at(word);
        return (count + k_) / denominator;
    }

    // Every token with a probability above 0, most likely first, ties alphabetical.
    std::vector<std::pair<std::string, double>> next_words(
        const std::vector<std::string>& context) const {
        std::vector<std::pair<std::string, double>> out;
        for (const std::string& w : vocab) {  // a std::set is alphabetical
            double p = prob(context, w);
            if (p > 0) out.push_back({w, p});
        }
        std::stable_sort(out.begin(), out.end(),
                         [](const auto& a, const auto& b) { return a.second > b.second; });
        return out;
    }

    // Draw tokens until </s>, using one uniform number in [0, 1) per token.
    std::vector<std::string> generate(const std::vector<double>& uniforms,
                                      size_t max_words = 10) const {
        std::vector<std::string> context(n_ - 1, BOS), words;
        size_t next = 0;
        while (words.size() < max_words) {
            double u = uniforms[next++], total = 0;
            std::string word;
            for (const auto& [w, p] : next_words(context)) {
                total += p;
                word = w;
                if (u < total) break;  // u lands in this word's stretch
            }
            words.push_back(word);
            if (word == EOS) break;
            context.push_back(word);
            context.erase(context.begin());
        }
        return words;
    }

    // P(sentence) ^ (-1 / N), over the N tokens after the start (</s> included).
    double perplexity(const std::vector<std::string>& words) const {
        std::vector<std::string> t = pad(words);
        double log_prob = 0;
        for (size_t i = n_ - 1; i < t.size(); i++) {
            std::vector<std::string> context(t.begin() + (i - (n_ - 1)), t.begin() + i);
            double p = prob(context, t[i]);
            if (p == 0) return std::numeric_limits<double>::infinity();  // impossible
            log_prob += std::log(p);
        }
        return std::exp(-log_prob / static_cast<double>(t.size() - (n_ - 1)));
    }

    std::map<std::string, std::map<std::string, int>> counts;  // context -> next -> count
    std::map<std::string, int> totals;                         // context -> tokens after it
    std::set<std::string> vocab;  // every token that can come next, </s> included

private:
    size_t n_;
    double k_;

    std::vector<std::string> pad(const std::vector<std::string>& words) const {
        std::vector<std::string> t(n_ - 1, BOS);
        t.insert(t.end(), words.begin(), words.end());
        t.push_back(EOS);
        return t;
    }

    static std::string join(const std::vector<std::string>& t, size_t from, size_t to) {
        std::string s;
        for (size_t i = from; i < to; i++) s += (i > from ? " " : "") + t[i];
        return s;
    }
};
