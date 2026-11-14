// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "lfu_cache.hpp"

int main() {
    std::string line;
    int capacity = 0;
    LFUCache cache(0);
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "new") {
            in >> capacity;
            cache = LFUCache(capacity);
        } else if (op == "get") {
            int k = 0;
            in >> k;
            std::cout << cache.get(k) << '\n';
        } else if (op == "put") {
            int k = 0, v = 0;
            in >> k >> v;
            bool existed = cache.contains(k);
            auto evicted = cache.put(k, v);
            if (existed)
                std::cout << "updated\n";
            else if (evicted)
                std::cout << "evict " << *evicted << '\n';
            else
                std::cout << "added\n";
        } else if (op == "clear") {
            cache = LFUCache(capacity);
            std::cout << "ok\n";
        } else if (op == "print") {
            std::string lists;
            for (const auto& [f, keys] : cache.byFrequency()) {
                if (!lists.empty()) lists += ' ';
                lists += std::to_string(f) + ':';
                bool first = true;
                for (int k : keys) {
                    if (!first) lists += ',';
                    lists += std::to_string(k);
                    first = false;
                }
            }
            std::cout << (lists.empty() ? "empty" : lists) << " | min " << cache.minFreq() << " | "
                      << cache.hits << ' ' << cache.misses << '\n';
        }
    }
}
