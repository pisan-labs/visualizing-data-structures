// Test driver: reads one operation per line, prints one result per line.
// "w <16 numbers>" sets the frozen W and "target <16 numbers>" the target update;
// "adapter r alpha <B row by row> <A row by row>" starts a new adapter. None prints.
// "train k" takes k Adam steps and prints the loss, a bar, and the rows of the update;
// "merge" prints the rows of W + update. Three decimals each.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "lora.hpp"

static const size_t D = 4;

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

static Matrix read(std::istringstream& in, size_t rows, size_t cols) {
    Matrix m(rows, std::vector<double>(cols));
    for (auto& row : m)
        for (double& v : row) in >> v;
    return m;
}

int main() {
    Matrix w, target;
    std::unique_ptr<LoRA> model;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "w") {
            w = read(in, D, D);
        } else if (op == "target") {
            target = read(in, D, D);
        } else if (op == "adapter") {
            size_t r;
            int alpha;
            in >> r >> alpha;
            Matrix b = read(in, D, r);
            Matrix a = read(in, r, D);
            model = std::make_unique<LoRA>(w, b, a, static_cast<double>(alpha));
        } else if (op == "train") {
            int k;
            in >> k;
            for (int t = 0; t < k; t++) model->train_step(target);
            std::cout << three(model->loss(target)) << " | " << rows(model->delta()) << "\n";
        } else if (op == "merge") {
            std::cout << rows(model->merge()) << "\n";
        }
    }
}
