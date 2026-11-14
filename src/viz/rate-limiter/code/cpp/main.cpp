// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "rate_limiters.hpp"

static std::unique_ptr<Limiter> make(const std::string& kind, int limit, int window) {
    if (kind == "fixed") return std::make_unique<FixedWindow>(limit, window);
    if (kind == "log") return std::make_unique<SlidingLog>(limit, window);
    if (kind == "counter") return std::make_unique<SlidingWindowCounter>(limit, window);
    return std::make_unique<TokenBucket>(limit, window);
}

int main() {
    std::string line, kind = "counter";
    int limit = 3, window = 10;
    std::unique_ptr<Limiter> limiter;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "new") {
            in >> kind >> limit >> window;
            limiter = make(kind, limit, window);
        } else if (op == "req") {
            int t = 0;
            in >> t;
            std::cout << (limiter->allow(t) ? "pass" : "refuse") << '\n';
        } else if (op == "clear") {
            limiter = make(kind, limit, window);
            std::cout << "ok\n";
        }
    }
}
