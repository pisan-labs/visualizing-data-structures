// Test driver: reads one operation per line, prints one line per result.
// "settings blocks size sharing" starts an empty pool (sharing 1 or 0) and prints nothing.
// "add n", "step", "finish X" and "fork X" each print every block table, the free list
// (top first) and how many blocks have been copied.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "block_manager.hpp"

static const int MAX_LEN = 16;
static const std::string NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

static std::string state_line(const BlockManager& m) {
    std::string out;
    for (const auto& [name, table] : m.tables) {
        if (!out.empty()) out += " / ";
        out += name;
        for (int p : table) out += " " + std::to_string(p);
    }
    if (out.empty()) out = "-";
    out += " | free";
    for (auto it = m.free.rbegin(); it != m.free.rend(); ++it) out += " " + std::to_string(*it);
    if (m.free.empty()) out += " -";
    return out + " | copies " + std::to_string(m.copies);
}

int main() {
    std::unique_ptr<BlockManager> m;
    size_t named = 0;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "settings") {
            int blocks, size, sharing;
            in >> blocks >> size >> sharing;
            m = std::make_unique<BlockManager>(blocks, size, MAX_LEN, sharing == 1);
            named = 0;
            continue;
        }
        if (op == "add") {
            int n;
            in >> n;
            m->add(NAMES[named++], n);
        } else if (op == "step") {
            m->step();
        } else {
            std::string name;
            in >> name;
            if (op == "finish") m->finish(name[0]);
            else m->fork(name[0], NAMES[named++]);
        }
        std::cout << state_line(*m) << "\n";
    }
}
