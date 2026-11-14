// Test driver: reads one operation per line, prints one result per line.
// "capacity C" starts an empty cache; "request X tokens..." prints
// "X matched m reused r prefilled p evicted e | tree"; "finish X" prints "X done | tree".
// The tree lists each node as tokens_joined:ref:last, with its children in brackets.
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "radix_cache.hpp"

static std::string tree(const Node* node) {
    std::string out;
    for (const auto& c : node->children) {
        if (!out.empty()) out += " ";
        for (size_t i = 0; i < c->tokens.size(); i++) out += (i ? "_" : "") + c->tokens[i];
        out += ":" + std::to_string(c->ref) + ":" + std::to_string(c->last);
        if (!c->children.empty()) out += "(" + tree(c.get()) + ")";
    }
    return out;
}

int main() {
    std::unique_ptr<RadixCache> cache;
    std::map<std::string, Node*> running;
    std::string line;
    auto treeOf = [&] {
        std::string t = tree(cache->root());
        return t.empty() ? std::string("-") : t;
    };
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "capacity") {
            int c;
            in >> c;
            cache = std::make_unique<RadixCache>(c);
            running.clear();
        } else if (op == "request") {
            std::string name, t;
            in >> name;
            std::vector<std::string> tokens;
            while (in >> t) tokens.push_back(t);
            Result r = cache->request(tokens);
            running[name] = r.node;
            int n = static_cast<int>(tokens.size());
            int reused = std::min(r.matched, n - 1);  // the last token always runs
            std::cout << name << " matched " << r.matched << " reused " << reused
                      << " prefilled " << n - reused << " evicted " << r.evicted << " | "
                      << treeOf() << "\n";
        } else if (op == "finish") {
            std::string name;
            in >> name;
            cache->finish(running[name]);
            running.erase(name);
            std::cout << name << " done | " << treeOf() << "\n";
        }
    }
}
