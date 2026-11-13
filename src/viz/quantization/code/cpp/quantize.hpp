#pragma once
#include <algorithm>
#include <cmath>
#include <string>
#include <utility>
#include <vector>

using Matrix = std::vector<std::vector<double>>;
using Cells = std::vector<std::pair<int, int>>;

// The nearest whole number; halves go away from zero.
inline int round_half_away(double x) {
    return static_cast<int>(std::copysign(std::floor(std::fabs(x) + 0.5), x));
}

// The scaling constant s and the zero point z for one group of weights.
struct Scale {
    double s;
    int z;
};

inline Scale scale_for(const std::vector<double>& values, int bits, const std::string& scheme) {
    if (scheme == "absmax") {
        int qmax = (1 << (bits - 1)) - 1;  // 127 for int8, 7 for int4
        double m = 0;
        for (double v : values) m = std::max(m, std::fabs(v));
        return {m > 0 ? qmax / m : 1.0, 0};
    }
    int qmax = (1 << bits) - 1;  // 255 for int8, 15 for int4
    double lo = 0, hi = 0;       // 0 stays in the range
    for (double v : values) {
        lo = std::min(lo, v);
        hi = std::max(hi, v);
    }
    double s = hi > lo ? qmax / (hi - lo) : 1.0;
    return {s, round_half_away(-lo * s)};
}

inline int quantize(double w, const Scale& g, int bits, const std::string& scheme) {
    int q = round_half_away(g.s * w);
    if (scheme == "absmax") return q;
    return std::max(0, std::min((1 << bits) - 1, q + g.z));
}

inline double dequantize(int q, const Scale& g) { return (q - g.z) / g.s; }

// The cells of each group: the whole matrix, each row, or blocks along a row.
inline std::vector<Cells> groups(int rows, int cols, const std::string& group) {
    std::vector<Cells> out;
    if (group == "tensor") {
        Cells all;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++) all.push_back({r, c});
        out.push_back(all);
        return out;
    }
    int size = group == "row" ? cols : std::stoi(group);
    for (int r = 0; r < rows; r++)
        for (int b = 0; b < cols; b += size) {
            Cells cells;
            for (int c = b; c < b + size; c++) cells.push_back({r, c});
            out.push_back(cells);
        }
    return out;
}

// Codes and decoded weights for a matrix, one scale per group.
inline void quantize_matrix(const Matrix& w, int bits, const std::string& scheme,
                            const std::string& group, std::vector<std::vector<int>>& codes,
                            Matrix& decoded) {
    int rows = static_cast<int>(w.size()), cols = static_cast<int>(w[0].size());
    codes.assign(rows, std::vector<int>(cols, 0));
    decoded.assign(rows, std::vector<double>(cols, 0.0));
    for (const Cells& cells : groups(rows, cols, group)) {
        std::vector<double> values;
        for (auto [r, c] : cells) values.push_back(w[r][c]);
        Scale g = scale_for(values, bits, scheme);
        for (auto [r, c] : cells) {
            codes[r][c] = quantize(w[r][c], g, bits, scheme);
            decoded[r][c] = dequantize(codes[r][c], g);
        }
    }
}
