// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "minimize.hpp"

int main() {
  std::vector<std::string> names, alphabet;
  std::map<std::string, int> index;
  std::vector<std::vector<std::string>> moves;
  std::vector<std::string> accept;
  std::string start;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, w;
    if (!(words >> op)) continue;
    if (op == "dfa") {
      names.clear();
      index.clear();
      alphabet.clear();
      moves.clear();
      accept.clear();
      while (words >> w) {
        index[w] = static_cast<int>(names.size());
        names.push_back(w);
      }
    } else if (op == "alphabet") {
      while (words >> w) alphabet.push_back(w);
    } else if (op == "start") {
      words >> start;
    } else if (op == "accept") {
      while (words >> w) accept.push_back(w);
    } else if (op == "move") {
      std::string p, c, q;
      words >> p >> c >> q;
      moves.push_back({p, c, q});
    } else if (op == "minimize") {
      int n = static_cast<int>(names.size()), k = static_cast<int>(alphabet.size());
      std::vector<std::vector<int>> delta(n, std::vector<int>(k, -1));
      for (auto& m : moves) {
        int c = 0;
        while (alphabet[c] != m[1]) c++;
        delta[index.at(m[0])][c] = index.at(m[2]);
      }
      std::vector<bool> acc(n, false);
      for (auto& q : accept) acc[index.at(q)] = true;
      Minimized r = minimize(delta, k, index.at(start), acc);
      std::string dead = "dead";
      for (int i = 2; index.count(dead); i++) dead = "dead" + std::to_string(i);
      std::string blocks, accepting, arrows;
      int startBlock = 0;
      for (int b = 0; b < static_cast<int>(r.blocks.size()); b++) {
        std::string set;
        for (int q : r.blocks[b]) {
          set += (set.empty() ? "" : ",") + (q < n ? names[q] : dead);
          if (q == index.at(start)) startBlock = b + 1;
        }
        blocks += (blocks.empty() ? "" : " ") + std::to_string(b + 1) + "={" + set + "}";
        int first = r.blocks[b][0];
        if (first < n && acc[first]) accepting += (accepting.empty() ? "" : " ") + std::to_string(b + 1);
        for (int c = 0; c < k; c++)
          arrows += (arrows.empty() ? "" : " ") + std::to_string(b + 1) + "-" + alphabet[c] + "->" +
                    std::to_string(r.moves[b][c] + 1);
      }
      std::cout << blocks << " | start " << startBlock << " | accept "
                << (accepting.empty() ? "-" : accepting) << " | " << (arrows.empty() ? "-" : arrows)
                << '\n';
    }
  }
  return 0;
}
