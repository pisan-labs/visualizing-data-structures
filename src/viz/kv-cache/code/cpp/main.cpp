// Test driver: reads one operation per line, prints one result per line.
// "w q|k|v rows cols <values>" sets a weight matrix. "settings window cache" sets the window
// (0 keeps every token) and the cache (1 on, 0 off). "prefill <4 numbers per token>" starts a
// new text and "decode <4 numbers>" adds a token. Each prints the outputs (prefill: one per
// prompt token, separated by " / "), a bar, and how many rows the cache holds.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>

#include "kv_cache.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string rows(const Matrix& m) {
    std::string out;
    for (size_t i = 0; i < m.size(); i++) {
        if (i) out += " / ";
        for (size_t j = 0; j < m[i].size(); j++) out += (j ? " " : "") + three(m[i][j]);
    }
    return out;
}

int main() {
    std::map<std::string, Matrix> w;
    Matrix xs;
    std::unique_ptr<KVCache> cache;
    size_t window = 0;
    bool use_cache = true;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "w") {
            std::string name;
            size_t r, c;
            in >> name >> r >> c;
            Matrix m(r, Vector(c));
            for (auto& row : m)
                for (double& v : row) in >> v;
            w[name] = m;
        } else if (op == "settings") {
            int on;
            in >> window >> on;
            use_cache = on == 1;
        } else if (op == "prefill") {
            xs.clear();
            Vector x(4);
            while (in >> x[0] >> x[1] >> x[2] >> x[3]) xs.push_back(x);
            cache = std::make_unique<KVCache>(w["q"], w["k"], w["v"], window);
            Matrix z = cache->prefill(xs);
            if (!use_cache) cache.reset();  // nothing is kept
            std::cout << rows(z) << " | " << (cache ? cache->size() : 0) << "\n";
        } else if (op == "decode") {
            Vector x(4);
            in >> x[0] >> x[1] >> x[2] >> x[3];
            xs.push_back(x);
            Vector z = cache ? cache->decode(x)
                             : decode_without_cache(xs, w["q"], w["k"], w["v"], window);
            std::cout << rows({z}) << " | " << (cache ? cache->size() : 0) << "\n";
        }
    }
}
