#pragma once
#include <algorithm>
#include <cmath>
#include <map>
#include <string>
#include <utility>
#include <vector>

// A next-word model: model[word] lists the next words and their probabilities.
using Model = std::map<std::string, std::vector<std::pair<std::string, double>>>;

// A hypothesis: the words after the start, and their log-probability.
struct Hyp {
    std::vector<std::string> words;
    std::string last;
    double score;
};

inline const std::string EOS = "</s>";

// Beam search. Returns the finished hypotheses in the order they finished.
inline std::vector<Hyp> beam_search(const Model& model, const std::string& start, size_t width,
                                    const std::string& eos, int max_len) {
    std::vector<Hyp> beam{{{}, start, 0.0}}, finished;
    size_t room = width;
    for (int t = 0; t < max_len; t++) {
        std::vector<Hyp> candidates;
        for (const Hyp& h : beam) {
            auto row = model.find(h.last);
            if (row == model.end()) continue;
            for (const auto& [w, p] : row->second) {
                Hyp c = h;
                c.words.push_back(w);
                c.last = w;
                c.score = h.score + std::log(p);
                candidates.push_back(c);
            }
        }
        // Best first; stable, so ties keep the order made.
        std::stable_sort(candidates.begin(), candidates.end(),
                         [](const Hyp& a, const Hyp& b) { return a.score > b.score; });
        beam.clear();
        if (eos == "shrink") {  // a finished hypothesis leaves, and the beam narrows
            size_t top = std::min(room, candidates.size());
            for (size_t i = 0; i < top; i++) {
                if (candidates[i].last == EOS) {
                    finished.push_back(candidates[i]);
                    room--;
                } else {
                    beam.push_back(candidates[i]);
                }
            }
            if (room == 0) break;
        } else {  // refill: keep width going; stop once width have finished
            for (size_t rank = 0; rank < candidates.size(); rank++) {
                if (candidates[rank].last == EOS) {
                    if (rank < width) finished.push_back(candidates[rank]);
                } else if (beam.size() < width) {
                    beam.push_back(candidates[rank]);
                }
            }
            if (finished.size() >= width) {
                beam.clear();
                break;
            }
        }
        if (beam.empty()) break;
    }
    finished.insert(finished.end(), beam.begin(), beam.end());  // cut at the length limit
    return finished;
}

// The best finished hypothesis: by log-probability, or by log-probability per word.
inline const Hyp* best_of(const std::vector<Hyp>& finished, bool normalize) {
    auto key = [&](const Hyp& h) { return normalize ? h.score / h.words.size() : h.score; };
    const Hyp* best = nullptr;
    for (const Hyp& h : finished)
        if (!best || key(h) > key(*best)) best = &h;
    return best;
}
