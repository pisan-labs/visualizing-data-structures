#pragma once
#include <string>
#include <vector>

// a = 1, b = 2, ..., z = 26 (not 0, or "b" and "ab" would collide).
inline long long val(char c) { return c - 'a' + 1; }

inline long long modp(long long x, long long p) { return ((x % p) + p) % p; }

// h(s) = s[0]*b^(m-1) + s[1]*b^(m-2) + ... + s[m-1], mod p, for every prefix of s.
struct PrefixHash {
    long long p;
    std::vector<long long> h;   // h[k] = hash of s[0..k-1]
    std::vector<long long> pw;  // pw[k] = b^k mod p

    PrefixHash(const std::string& s, long long b, long long p)
        : p(p), h(s.size() + 1, 0), pw(s.size() + 1, 1) {
        for (std::size_t i = 0; i < s.size(); ++i) {
            h[i + 1] = (h[i] * b + val(s[i])) % p;
            pw[i + 1] = pw[i] * b % p;
        }
    }

    // Hash of s[l..r], inclusive, in O(1).
    long long get(int l, int r) const { return modp(h[r + 1] - h[l] * pw[r - l + 1], p); }
};

// The hash of every window of k characters, each rolled from the one before.
inline std::vector<long long> windowHashes(const std::string& s, int k, long long b, long long p) {
    long long top = 1;  // the weight of a window's first character, b^(k-1) mod p
    for (int i = 1; i < k; ++i) top = top * b % p;
    long long h = 0;
    for (int i = 0; i < k; ++i) h = (h * b + val(s[i])) % p;
    std::vector<long long> out{h};
    for (int i = k; i < static_cast<int>(s.size()); ++i) {
        h = modp((h - val(s[i - k]) * top) * b + val(s[i]), p);
        out.push_back(h);
    }
    return out;
}
