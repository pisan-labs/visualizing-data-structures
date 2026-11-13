// Test driver: reads one operation per line, prints one result per line.
// "surface id" picks the loss, "optimizer method lr beta1 beta2 bias" the method and
// "start x [y]" a starting point and a fresh optimizer; none of them prints.
// "step" takes one step and prints the new point, three decimals per coordinate.
#include <cmath>
#include <cstdio>
#include <functional>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "optimizers.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::function<Vec(const Vec&)> gradient(const std::string& surface) {
    if (surface == "bowl") return [](const Vec& p) { return Vec{2 * p[0]}; };
    if (surface == "wells") return [](const Vec& p) { return Vec{p[0] * p[0] * p[0] - 2 * p[0] + 0.3}; };
    if (surface == "round") return [](const Vec& p) { return Vec{p[0], p[1]}; };
    if (surface == "narrow") return [](const Vec& p) { return Vec{p[0], 10 * p[1]}; };
    return [](const Vec& p) {
        return Vec{-2 * (1 - p[0]) - 20 * p[0] * (p[1] - p[0] * p[0]), 10 * (p[1] - p[0] * p[0])};
    };
}

int main() {
    std::function<Vec(const Vec&)> grad;
    std::string method, lr, beta1, beta2, bias;
    std::unique_ptr<Optimizer> opt;
    Vec x;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "surface") {
            std::string id;
            in >> id;
            grad = gradient(id);
        } else if (op == "optimizer") {
            in >> method >> lr >> beta1 >> beta2 >> bias;
        } else if (op == "start") {
            x.clear();
            for (double v; in >> v;) x.push_back(v);
            if (method == "gd") opt = std::make_unique<GradientDescent>(std::stod(lr));
            else if (method == "momentum")
                opt = std::make_unique<Momentum>(std::stod(lr), std::stod(beta1));
            else
                opt = std::make_unique<Adam>(std::stod(lr), std::stod(beta1), std::stod(beta2),
                                             bias == "1");
        } else if (op == "step") {
            x = opt->step(x, grad(x));
            for (size_t i = 0; i < x.size(); i++) std::cout << (i ? " " : "") << three(x[i]);
            std::cout << "\n";
        }
    }
}
