// Test driver: "load v1 v2 ..." replaces the array and drops queued updates; "add l r x" queues
// an update; "apply" applies the queued updates, prints the array, and empties the queue.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "difference_array.hpp"

int main() {
    std::vector<int> a;
    std::vector<Update> queued;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        if (cmd == "load") {
            a.clear();
            queued.clear();
            for (int v; in >> v;) a.push_back(v);
        } else if (cmd == "add") {
            Update u{};
            in >> u.l >> u.r >> u.x;
            queued.push_back(u);
        } else if (cmd == "apply") {
            a = applyUpdates(a, queued);
            queued.clear();
            for (std::size_t i = 0; i < a.size(); ++i) std::cout << (i ? " " : "") << a[i];
            std::cout << "\n";
        }
    }
}
