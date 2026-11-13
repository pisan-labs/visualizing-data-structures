// Term -> postings list of (document, term frequency), ranked with BM25.
#pragma once
#include <algorithm>
#include <cmath>
#include <map>
#include <queue>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

struct Posting {
    int doc, tf;
};

struct Hit {
    int doc;
    double score;
};

// a is a weaker hit than b: a lower score, or the same score and a later document.
inline bool weaker(const Hit& a, const Hit& b) {
    return a.score < b.score || (a.score == b.score && a.doc > b.doc);
}

class InvertedIndex {
public:
    std::unordered_map<std::string, std::vector<Posting>> index;  // in document order
    std::vector<int> lengths;                                    // documents count from 1

    int add(const std::vector<std::string>& words) {
        int doc = static_cast<int>(lengths.size()) + 1;
        lengths.push_back(static_cast<int>(words.size()));
        std::vector<std::pair<std::string, int>> counts;  // in order of first appearance
        for (const std::string& w : words) {
            auto it = std::find_if(counts.begin(), counts.end(), [&](auto& c) { return c.first == w; });
            if (it == counts.end())
                counts.push_back({w, 1});
            else
                it->second++;
        }
        for (auto& [term, tf] : counts) index[term].push_back({doc, tf});
        return doc;
    }

    // The k best hits, best first.
    std::vector<Hit> search(const std::vector<std::string>& query, double k1, double b,
                            const std::string& idf, int k = 3) const {
        int n = static_cast<int>(lengths.size());
        double total = 0;
        for (int len : lengths) total += len;
        double avgdl = total / n;
        std::map<int, double> scores;
        for (const std::string& term : query) {  // a word typed twice counts twice
            auto it = index.find(term);
            if (it == index.end()) continue;
            const std::vector<Posting>& postings = it->second;
            double ratio = (n - static_cast<double>(postings.size()) + 0.5) / (postings.size() + 0.5);
            double weight = idf == "rsj" ? std::log(ratio) : std::log(1 + ratio);
            for (const Posting& p : postings) {
                double B = 1 - b + b * lengths[p.doc - 1] / avgdl;
                double part = p.tf / (p.tf + k1 * B);
                auto s = scores.find(p.doc);
                if (s == scores.end())
                    scores[p.doc] = weight * part;
                else
                    s->second = s->second + weight * part;
            }
        }
        // A heap of size k: the weakest kept on top.
        auto cmp = [](const Hit& x, const Hit& y) { return weaker(y, x); };
        std::priority_queue<Hit, std::vector<Hit>, decltype(cmp)> heap(cmp);
        for (auto& [doc, score] : scores) {
            Hit h{doc, score};
            if (static_cast<int>(heap.size()) < k)
                heap.push(h);
            else if (weaker(heap.top(), h)) {
                heap.pop();
                heap.push(h);
            }
        }
        std::vector<Hit> out;
        for (; !heap.empty(); heap.pop()) out.push_back(heap.top());
        std::reverse(out.begin(), out.end());
        return out;
    }
};
