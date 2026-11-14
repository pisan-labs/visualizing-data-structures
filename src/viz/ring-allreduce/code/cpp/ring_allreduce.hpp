#pragma once
#include <vector>

using Vectors = std::vector<std::vector<long long>>;

// v[i] is worker i's vector, cut into n chunks. In step t every worker i sends chunk
// (i - t) mod n to worker i + 1, which adds it to its own. All sends in a step happen at once.
// Afterwards worker i holds the whole sum of chunk (i + 1) mod n.
inline void reduce_scatter(Vectors& v) {
    int n = static_cast<int>(v.size());
    for (int t = 0; t < n - 1; t++) {
        std::vector<long long> sent(n);
        for (int i = 0; i < n; i++) sent[i] = v[i][((i - t) % n + n) % n];
        for (int i = 0; i < n; i++) v[(i + 1) % n][((i - t) % n + n) % n] += sent[i];
    }
}

// After reduce_scatter: pass each finished chunk once round the ring.
inline void all_gather(Vectors& v) {
    int n = static_cast<int>(v.size());
    for (int t = 0; t < n - 1; t++) {
        std::vector<long long> sent(n);
        for (int i = 0; i < n; i++) sent[i] = v[i][((i + 1 - t) % n + n) % n];
        for (int i = 0; i < n; i++) v[(i + 1) % n][((i + 1 - t) % n + n) % n] = sent[i];
    }
}

// Every worker ends with the sum; each sends 2(n - 1) chunks, 2(n - 1)/n of a vector.
inline void ring_all_reduce(Vectors& v) {
    reduce_scatter(v);
    all_gather(v);
}
