// The pumping lemma game: membership tests, legal splits, pumping, and both players' searches.
// A split is the lengths of its pieces: {x, y, z} (regular) or {u, v, x, y, z} (context-free).
#pragma once
#include <algorithm>
#include <cmath>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

constexpr int MAX_I = 5;  // the largest i either player uses
using Parts = std::vector<int>;

inline bool isPrime(int n) {
    if (n < 2) return false;
    for (int d = 2; d * d <= n; d++)
        if (n % d == 0) return false;
    return true;
}

inline bool balanced(const std::string& w) {
    int depth = 0;
    for (char c : w) {
        depth += c == '(' ? 1 : -1;
        if (depth < 0) return false;
    }
    return depth == 0;
}

// w is letters[0]* letters[1]* ...: every symbol one of them, in that order.
inline bool ordered(const std::string& w, const std::string& letters) {
    size_t at = 0;
    for (char c : w) {
        size_t k = letters.find(c);
        if (k == std::string::npos || k < at) return false;
        at = k;
    }
    return true;
}

inline bool member(const std::string& lang, const std::string& w) {
    auto n = [&](char c) { return std::count(w.begin(), w.end(), c); };
    int len = static_cast<int>(w.size());
    int r = static_cast<int>(std::lround(std::sqrt(len)));
    if (lang == "anbn") return ordered(w, "ab") && n('a') == n('b');
    if (lang == "paren") return balanced(w);
    if (lang == "wwr") return len % 2 == 0 && std::equal(w.begin(), w.end(), w.rbegin());
    if (lang == "ww") return len % 2 == 0 && w.substr(0, len / 2) == w.substr(len / 2);
    if (lang == "anbncn") return ordered(w, "abc") && n('a') == n('b') && n('b') == n('c');
    if (lang == "squares") return ordered(w, "a") && r * r == len;
    if (lang == "primes") return ordered(w, "a") && isPrime(len);
    if (lang == "astarbstar") return ordered(w, "ab");
    if (lang == "abstar") {
        for (int i = 0; i < len; i++)
            if (w[i] != "ab"[i % 2]) return false;
        return len % 2 == 0;
    }
    throw std::invalid_argument(lang);
}

// Every legal split of a string of length n, x (or u) first.
inline std::vector<Parts> splits(int n, int p, bool regular) {
    std::vector<Parts> out;
    if (regular) {  // |xy| <= p, |y| >= 1
        for (int x = 0; x < p && x < n; x++)
            for (int y = 1; x + y <= p && x + y <= n; y++) out.push_back({x, y, n - x - y});
        return out;
    }
    for (int u = 0; u < n; u++)  // |vxy| <= p, |vy| >= 1
        for (int v = 0; v <= p; v++)
            for (int x = 0; v + x <= p; x++)
                for (int y = 0; v + x + y <= p; y++)
                    if (v + y > 0 && u + v + x + y <= n)
                        out.push_back({u, v, x, y, n - u - v - x - y});
    return out;
}

inline std::string pump(const std::string& s, const Parts& parts, int i, bool regular) {
    std::string out;
    size_t at = 0;
    for (size_t k = 0; k < parts.size(); k++) {
        std::string piece = s.substr(at, parts[k]);
        bool pumped = k == 1 || (!regular && k == 3);
        for (int c = 0; c < (pumped ? i : 1); c++) out += piece;
        at += parts[k];
    }
    return out;
}

struct Search {
    int count = 0, survivors = 0;
    Parts pick;
};

// Try every split; keep one that stays in L for every i, else the one that lasts longest.
inline Search adversary(const std::string& lang, const std::string& s, int p, bool regular) {
    Search r;
    int best = -1;
    for (const Parts& parts : splits(static_cast<int>(s.size()), p, regular)) {
        int score = 0;
        for (int i = 0; i <= MAX_I; i++) score += member(lang, pump(s, parts, i, regular));
        r.count++;
        if (score == MAX_I + 1) r.survivors++;
        if (score > best) {
            best = score;
            r.pick = parts;
        }
    }
    return r;
}

// The first i that pumps s out of L, or nothing if the split survives them all.
inline std::optional<int> prover(const std::string& lang, const std::string& s, const Parts& parts,
                                 bool regular) {
    for (int i : {0, 2, 3, 4, 5})
        if (!member(lang, pump(s, parts, i, regular))) return i;
    return std::nullopt;
}
