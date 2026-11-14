// Test driver: "best v1 v2 ..." builds a tree from a level-order list (_ for a gap) and prints
// the best total, then the chosen values in preorder.
#include <deque>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "tree_choice.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd) || cmd != "best") continue;
        std::vector<std::string> t;
        for (std::string w; in >> w;) t.push_back(w);
        std::vector<std::unique_ptr<Node>> keep;
        Node* root = nullptr;
        if (!t.empty() && t[0] != "_") {
            keep.push_back(std::make_unique<Node>(std::stoi(t[0])));
            root = keep.back().get();
            std::deque<Node*> queue{root};
            std::size_t i = 1;
            while (i < t.size() && !queue.empty()) {
                Node* node = queue.front();
                queue.pop_front();
                for (int side = 0; side < 2; side++, i++) {
                    if (i >= t.size() || t[i] == "_") continue;
                    keep.push_back(std::make_unique<Node>(std::stoi(t[i])));
                    (side == 0 ? node->left : node->right) = keep.back().get();
                    queue.push_back(keep.back().get());
                }
            }
        }
        std::vector<int> r = bestChoice(root);
        for (std::size_t k = 0; k < r.size(); k++) std::cout << (k ? " " : "") << r[k];
        std::cout << "\n";
    }
}
