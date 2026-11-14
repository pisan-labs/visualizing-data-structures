#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>
#include <vector>

using Matrix = std::vector<std::vector<double>>;

struct Result {
    Matrix o;                 // the outputs, one row per word
    std::vector<double> m;    // each row's running max
    std::vector<double> l;    // each row's running sum
    std::vector<long> moved;  // numbers moved to and from HBM: Q; K and V; O, m, l; the table
};

const double NEG_INF = -std::numeric_limits<double>::infinity();

// Row i's scores q_i . k_j / sqrt(d_k) for the keys j0 <= j < j1 it may see.
inline std::vector<std::pair<size_t, double>> scores(const Matrix& q, const Matrix& k, size_t i,
                                                     size_t j0, size_t j1, bool causal) {
    std::vector<std::pair<size_t, double>> out;
    for (size_t j = j0; j < j1; j++) {
        if (causal && j > i) continue;  // the mask: a word sees only the words up to it
        double s = 0;
        for (size_t t = 0; t < q[i].size(); t++) s += q[i][t] * k[j][t];
        out.push_back({j, s / std::sqrt(static_cast<double>(q[i].size()))});
    }
    return out;
}

// The online softmax: fold one tile's scores into row i's running m, l and o.
inline void update(size_t i, const std::vector<std::pair<size_t, double>>& seen, const Matrix& v,
                   Result& r) {
    double mt = NEG_INF;
    for (auto& js : seen) mt = std::max(mt, js.second);
    std::vector<double> p;
    double lt = 0;
    for (auto& js : seen) {
        p.push_back(std::exp(js.second - mt));
        lt += p.back();
    }
    double mNew = std::max(r.m[i], mt);
    double a = std::exp(r.m[i] - mNew), b = std::exp(mt - mNew);  // rescale the old, the new
    double lNew = a * r.l[i] + b * lt;
    for (size_t c = 0; c < r.o[i].size(); c++) {
        double pv = 0;
        for (size_t x = 0; x < p.size(); x++) pv += p[x] * v[seen[x].first][c];
        r.o[i][c] = (r.l[i] * a * r.o[i][c] + b * pv) / lNew;
    }
    r.m[i] = mNew;
    r.l[i] = lNew;
}

// Q in blocks of br rows against K and V in blocks of bc; the table is never stored.
inline Result flash_attention(const Matrix& q, const Matrix& k, const Matrix& v, size_t br,
                              size_t bc, bool causal = true, bool q_outside = false) {
    size_t n = q.size(), d = v[0].size();
    Result r{Matrix(n, std::vector<double>(d, 0.0)), std::vector<double>(n, NEG_INF),
             std::vector<double>(n, 0.0), std::vector<long>(4, 0)};
    auto tile = [&](size_t i0, size_t i1, size_t j0, size_t j1) {
        for (size_t i = i0; i < i1; i++) {
            auto seen = scores(q, k, i, j0, j1, causal);
            if (!seen.empty()) update(i, seen, v, r);
        }
    };
    auto hidden = [&](size_t i1, size_t j0) { return causal && i1 - 1 < j0; };
    if (q_outside) {  // FlashAttention-2's loop order
        for (size_t i0 = 0; i0 < n; i0 += br) {
            size_t i1 = std::min(n, i0 + br);
            r.moved[0] += (i1 - i0) * d;  // read Q_i
            for (size_t j0 = 0; j0 < n; j0 += bc) {
                size_t j1 = std::min(n, j0 + bc);
                if (hidden(i1, j0)) continue;  // every score masked: skip
                r.moved[1] += 2 * (j1 - j0) * d;  // read K_j and V_j
                tile(i0, i1, j0, j1);
            }
            r.moved[2] += (i1 - i0) * d;  // write O_i
        }
    } else {  // the 2022 paper's loop order
        r.moved[2] += n * d + 2 * n;  // O, l and m start in HBM
        for (size_t j0 = 0; j0 < n; j0 += bc) {
            size_t j1 = std::min(n, j0 + bc);
            r.moved[1] += 2 * (j1 - j0) * d;  // read K_j and V_j, once
            for (size_t i0 = 0; i0 < n; i0 += br) {
                size_t i1 = std::min(n, i0 + br);
                if (hidden(i1, j0)) continue;  // every score masked: skip
                r.moved[0] += (i1 - i0) * d;  // read Q_i
                r.moved[2] += 2 * ((i1 - i0) * d + 2 * (i1 - i0));  // O_i, l_i, m_i in and out
                tile(i0, i1, j0, j1);
            }
        }
    }
    return r;
}

// Plain attention, for comparison: the whole table of scores, then softmax by rows.
inline Result attention(const Matrix& q, const Matrix& k, const Matrix& v, bool causal = true) {
    size_t n = q.size(), d = v[0].size();
    Result r{Matrix(n, std::vector<double>(d, 0.0)), std::vector<double>(n),
             std::vector<double>(n), {}};
    for (size_t i = 0; i < n; i++) {
        std::vector<double> row(n, NEG_INF);
        for (auto& js : scores(q, k, i, 0, n, causal)) row[js.first] = js.second;
        double mx = *std::max_element(row.begin(), row.end());
        std::vector<double> e(n);
        double total = 0;
        for (size_t j = 0; j < n; j++) {
            e[j] = std::exp(row[j] - mx);
            total += e[j];
        }
        for (size_t c = 0; c < d; c++) {
            double z = 0;
            for (size_t j = 0; j < n; j++) z += e[j] / total * v[j][c];
            r.o[i][c] = z;
        }
        r.m[i] = mx;
        r.l[i] = total;
    }
    // Q; K and V; O; and S and P, each written to HBM and read back.
    long nd = static_cast<long>(n * d), nn = static_cast<long>(n * n);
    r.moved = {nd, 2 * nd, nd, 4 * nn};
    return r;
}
