// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "subsets.hpp"

static std::string letter(int i) {
  std::string s(1, static_cast<char>('A' + i % 26));
  return i >= 26 ? s + std::to_string(i / 26) : s;
}

int main() {
  std::vector<std::string> names, alphabet;
  std::map<std::string, int> index;
  std::vector<std::vector<std::vector<int>>> moves;
  std::vector<std::vector<int>> eps;
  int start = 0;
  unsigned accept = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, w;
    if (!(words >> op)) continue;
    if (op == "nfa") {
      names.clear();
      index.clear();
      alphabet.clear();
      accept = 0;
      while (words >> w) {
        index[w] = static_cast<int>(names.size());
        names.push_back(w);
      }
      eps.assign(names.size(), {});
      moves.assign(names.size(), {});
    } else if (op == "alphabet") {
      while (words >> w) alphabet.push_back(w);
      for (auto& m : moves) m.assign(alphabet.size(), {});
    } else if (op == "start") {
      words >> w;
      start = index.at(w);
    } else if (op == "accept") {
      while (words >> w) accept |= 1u << index.at(w);
    } else if (op == "move") {
      std::string p, c, q;
      words >> p >> c >> q;
      if (c == "eps") {
        eps[index.at(p)].push_back(index.at(q));
      } else {
        int k = 0;
        while (alphabet[k] != c) k++;
        moves[index.at(p)][k].push_back(index.at(q));
      }
    } else if (op == "convert") {
      int k = static_cast<int>(alphabet.size());
      Subsets d = subsetConstruction(moves, eps, k, start, accept);
      std::string states, acc, arrows;
      for (int i = 0; i < static_cast<int>(d.sets.size()); i++) {
        std::string set;
        for (int q = 0; q < static_cast<int>(names.size()); q++)
          if (d.sets[i] >> q & 1u) set += (set.empty() ? "" : ",") + names[q];
        states += (states.empty() ? "" : " ") + letter(i) + "={" + set + "}";
        if (d.accepts[i]) acc += (acc.empty() ? "" : " ") + letter(i);
        for (int c = 0; c < k; c++)
          arrows += (arrows.empty() ? "" : " ") + letter(i) + "-" + alphabet[c] + "->" +
                    letter(d.delta[i][c]);
      }
      std::cout << states << " | accept " << (acc.empty() ? "-" : acc) << " | "
                << (arrows.empty() ? "-" : arrows) << '\n';
    }
  }
  return 0;
}
