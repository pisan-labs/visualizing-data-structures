// Test driver: "init b p" sets the base and modulus; "load s" hashes the prefixes of s;
// "prefix" prints h[0..n]; "hash l r" prints the hash of s[l..r]; "compare i j len" prints
// equal, different or collision; "windows k" prints the hash of every window of k.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "string_hash.hpp"

static void print(const std::vector<long long>& a) {
    for (std::size_t i = 0; i < a.size(); ++i) std::cout << (i ? " " : "") << a[i];
    std::cout << "\n";
}

int main() {
    long long b = 0, p = 1;
    std::string s;
    std::unique_ptr<PrefixHash> ph;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        if (cmd == "init") {
            in >> b >> p;
        } else if (cmd == "load") {
            in >> s;
            ph = std::make_unique<PrefixHash>(s, b, p);
        } else if (cmd == "prefix") {
            print(ph->h);
        } else if (cmd == "hash") {
            int l, r;
            in >> l >> r;
            std::cout << ph->get(l, r) << "\n";
        } else if (cmd == "compare") {
            int i, j, n;
            in >> i >> j >> n;
            if (ph->get(i, i + n - 1) != ph->get(j, j + n - 1)) std::cout << "different\n";
            else std::cout << (s.substr(i, n) == s.substr(j, n) ? "equal" : "collision") << "\n";
        } else if (cmd == "windows") {
            int k;
            in >> k;
            print(windowHashes(s, k, b, p));
        }
    }
}
