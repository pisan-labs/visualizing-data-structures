// Test driver: "load r c v1 v2 ..." replaces the matrix (r rows, c columns, row by row);
// "spiral" prints the values in spiral order; "rotate" turns it clockwise in place and prints
// its rows, separated by " / ".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "matrix.hpp"

int main() {
    Matrix m;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        if (cmd == "load") {
            int rows, cols;
            in >> rows >> cols;
            m.assign(rows, std::vector<int>(cols));
            for (auto& row : m)
                for (int& v : row) in >> v;
        } else if (cmd == "spiral") {
            std::string sep;
            for (int v : spiralOrder(m)) {
                std::cout << sep << v;
                sep = " ";
            }
            std::cout << "\n";
        } else if (cmd == "rotate") {
            rotate(m);
            std::string rowSep;
            for (const auto& row : m) {
                std::cout << rowSep;
                std::string sep;
                for (int v : row) {
                    std::cout << sep << v;
                    sep = " ";
                }
                rowSep = " / ";
            }
            std::cout << "\n";
        }
    }
}
