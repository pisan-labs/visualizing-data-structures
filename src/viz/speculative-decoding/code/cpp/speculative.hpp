// Speculative decoding: a small model drafts k words, one pass of a large model checks them.
#pragma once
#include <algorithm>
#include <functional>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

const std::string END = "</s>";

using Words = std::vector<std::string>;
using Dist = std::map<std::string, double>;
using Model = std::function<std::optional<Dist>(const Words&)>;

// P(w | the n-1 words before it), by counting; nothing for a context never seen.
inline Model ngram_model(const std::vector<std::string>& sentences, int n) {
    std::map<Words, std::map<std::string, int>> counts;
    for (const auto& s : sentences) {
        Words words(n - 1, "<s>");
        std::istringstream in(s);
        for (std::string w; in >> w;) words.push_back(w);
        words.push_back(END);
        for (size_t i = n - 1; i < words.size(); i++)
            counts[Words(words.begin() + (i - n + 1), words.begin() + i)][words[i]]++;
    }
    return [counts, n](const Words& prefix) -> std::optional<Dist> {
        Words padded(n - 1, "<s>");
        padded.insert(padded.end(), prefix.begin(), prefix.end());
        auto it = counts.find(Words(padded.end() - (n - 1), padded.end()));
        if (it == counts.end()) return std::nullopt;
        int total = 0;
        for (const auto& [w, c] : it->second) total += c;
        Dist d;
        for (const auto& [w, c] : it->second) d[w] = static_cast<double>(c) / total;
        return d;
    };
}

// Most likely first, ties alphabetical.
inline Words ordered(const Dist& d) {
    Words ws;
    for (const auto& [w, p] : d) ws.push_back(w);
    std::stable_sort(ws.begin(), ws.end(),
                     [&](const std::string& a, const std::string& b) { return d.at(a) > d.at(b); });
    return ws;
}

// The word whose stretch of [0, 1) holds u, laying the words end to end.
inline std::string draw(const Dist& d, double u) {
    Words ws = ordered(d);
    double cum = 0;
    for (const auto& w : ws) {
        cum += d.at(w);
        if (u < cum) return w;
    }
    return ws.back();
}

inline double chance(const Dist& d, const std::string& w) {
    auto it = d.find(w);
    return it == d.end() ? 0 : it->second;
}

// norm(max(0, p - q)): what the target wanted more than the draft gave.
inline Dist leftover(const Dist& p, const Dist& q) {
    Words keep;
    Dist r;
    double total = 0;
    for (const auto& w : ordered(p)) {
        double v = p.at(w) - chance(q, w);
        if (v > 0) {
            keep.push_back(w);
            r[w] = v;
            total += v;
        }
    }
    for (const auto& w : keep) r[w] /= total;
    return r;
}

struct Result {
    size_t accepted;
    Words words;
};

// One round: up to k drafts, one target pass, the tests, and the word the target adds.
// next() gives the uniform numbers in order.
inline Result speculative_step(const Words& prefix, int k, const Model& draft, const Model& target,
                               const std::function<double()>& next, bool greedy) {
    Words drafts;
    std::vector<Dist> qs;
    for (int i = 0; i < k; i++) {
        Words ctx = prefix;
        ctx.insert(ctx.end(), drafts.begin(), drafts.end());
        Dist q = *draft(ctx);
        std::string x = greedy ? ordered(q)[0] : draw(q, next());
        drafts.push_back(x);
        qs.push_back(q);
        if (x == END) break;
    }
    bool ended = !drafts.empty() && drafts.back() == END;
    // One pass of the target: p at every draft position, and after the last one.
    std::vector<Dist> ps;
    for (size_t i = 0; i <= drafts.size(); i++) {
        if (i == drafts.size() && ended) break;
        Words ctx = prefix;
        ctx.insert(ctx.end(), drafts.begin(), drafts.begin() + static_cast<long>(i));
        ps.push_back(*target(ctx));
    }
    for (size_t i = 0; i < drafts.size(); i++) {
        const std::string& x = drafts[i];
        bool ok = greedy ? ordered(ps[i])[0] == x : next() < chance(ps[i], x) / qs[i].at(x);
        if (!ok) {
            Words out(drafts.begin(), drafts.begin() + static_cast<long>(i));
            out.push_back(greedy ? ordered(ps[i])[0] : draw(leftover(ps[i], qs[i]), next()));
            return {i, out};
        }
    }
    if (ended) return {drafts.size(), drafts};
    const Dist& last = ps.back();
    size_t n = drafts.size();
    drafts.push_back(greedy ? ordered(last)[0] : draw(last, next()));
    return {n, drafts};
}
