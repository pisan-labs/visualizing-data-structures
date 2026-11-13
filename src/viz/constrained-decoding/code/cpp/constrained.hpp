// Constrained decoding: a DFA, the index of allowed tokens per state, and masked decoding.
#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

const std::string END = "</s>";

struct Dfa {
    std::string start;
    std::set<std::string> accept;
    std::vector<std::string> states;
    std::map<std::pair<std::string, char>, std::string> delta;
};

// The state token ends in from q, or nothing if a letter has no move (the text would leave the
// regex). </s> reads nothing and is allowed only in an accepting state.
inline std::optional<std::string> walk(const Dfa& dfa, std::string q, const std::string& token) {
    if (token == END) return dfa.accept.count(q) ? std::optional<std::string>(q) : std::nullopt;
    for (char c : token) {
        auto it = dfa.delta.find({q, c});
        if (it == dfa.delta.end()) return std::nullopt;
        q = it->second;
    }
    return q;
}

// For each state, every token that keeps the text on the DFA (in vocabulary order), with the
// state it ends in. Built once per regex; each decoding step is then a lookup.
using Row = std::vector<std::pair<std::string, std::string>>;

inline std::map<std::string, Row> build_index(const Dfa& dfa, const std::vector<std::string>& vocab) {
    std::map<std::string, Row> index;
    for (const auto& q : dfa.states) {
        Row& row = index[q];
        for (const auto& t : vocab)
            if (auto to = walk(dfa, q, t)) row.emplace_back(t, *to);
    }
    return index;
}

inline std::vector<double> softmax(const std::vector<double>& z) {
    double m = -std::numeric_limits<double>::infinity();
    for (double v : z) m = std::max(m, v);
    std::vector<double> e;
    double total = 0;
    for (double v : z) {
        e.push_back(std::exp(v - m));
        total += e.back();
    }
    for (double& v : e) v /= total;
    return e;
}

// Set the logits of tokens not allowed to -infinity (allowed null: no mask), then take the
// most likely token, or the one whose stretch of [0, 1) holds u, in vocabulary order.
inline std::string next_token(const std::vector<std::string>& vocab,
                              const std::vector<double>& logits, const Row* allowed, bool greedy,
                              double u) {
    std::vector<double> z;
    for (size_t k = 0; k < vocab.size(); k++) {
        bool ok = allowed == nullptr;
        if (allowed)
            for (const auto& [t, to] : *allowed) ok = ok || t == vocab[k];
        z.push_back(ok ? logits[k] : -std::numeric_limits<double>::infinity());
    }
    std::vector<double> p = softmax(z);
    if (greedy) {
        size_t best = 0;
        for (size_t k = 1; k < p.size(); k++)
            if (p[k] > p[best]) best = k;
        return vocab[best];
    }
    double cum = 0;
    size_t last = 0;
    for (size_t k = 0; k < p.size(); k++) {
        cum += p[k];
        if (u < cum) return vocab[k];
        if (p[k] > 0) last = k;
    }
    return vocab[last];
}
