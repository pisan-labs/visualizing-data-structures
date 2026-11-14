// Test driver: reads one operation per line, prints one result per line.
// "load n <n * n numbers, worker by worker>" sets the gradients (no output).
// "scatter", "gather" and "allreduce" run that part, skipping what has already run,
// and print every worker's vector, " / " between workers.
#include <iostream>
#include <sstream>
#include <string>

#include "ring_allreduce.hpp"

int main() {
    Vectors v;
    std::string phase = "start";
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "load") {
            size_t n;
            in >> n;
            v.assign(n, std::vector<long long>(n));
            for (auto& row : v)
                for (long long& x : row) in >> x;
            phase = "start";
            continue;
        }
        if (op == "scatter" && phase == "start") {
            reduce_scatter(v);
            phase = "scattered";
        } else if ((op == "gather" || op == "allreduce") && phase != "done") {
            if (phase == "start") reduce_scatter(v);
            all_gather(v);
            phase = "done";
        }
        for (size_t i = 0; i < v.size(); i++) {
            if (i) std::cout << " / ";
            for (size_t j = 0; j < v[i].size(); j++) std::cout << (j ? " " : "") << v[i][j];
        }
        std::cout << "\n";
    }
}
