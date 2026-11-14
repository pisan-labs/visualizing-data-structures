// Test driver: reads one operation per line, prints one result per line.
// "model rnn <w>", "model lstm" or "model lstm97" starts a new sentence;
// "x <four numbers>" reads one word and prints h and the pull (RNN), or
// f i g c o h and the pull (LSTM), three decimals each.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "recurrent.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000, k % 1000);
    return buf;
}

int main() {
    std::unique_ptr<Recurrent> net;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "model") {
            std::string model;
            double w = 0.8;
            in >> model;
            if (!(in >> w)) w = 0.8;  // only the plain RNN has a w
            net = std::make_unique<Recurrent>(model, w);
        } else if (op == "x") {
            Vec x{};
            for (double& v : x) in >> v;
            std::string sep;
            for (double v : net->read(x)) {
                std::cout << sep << three(v);
                sep = " ";
            }
            std::cout << '\n';
        }
    }
}
