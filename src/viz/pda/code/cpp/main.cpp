// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "pda.hpp"

int main() {
  std::string start, stack;
  std::set<std::string> accept;
  std::vector<Pda::Move> moves;
  bool byStack = false;
  std::string line;
  auto symbol = [](const std::string& s) { return s == "eps" ? Pda::EPS : s[0]; };
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "pda") {
      start.clear();
      stack.clear();
      accept.clear();
      moves.clear();
      byStack = false;
    } else if (op == "start") {
      words >> start;
    } else if (op == "accept") {
      for (std::string q; words >> q;) accept.insert(q);
    } else if (op == "stack") {
      for (std::string s; words >> s;) stack += s;
    } else if (op == "by") {
      std::string by;
      words >> by;
      byStack = by == "stack";
    } else if (op == "move") {
      std::string from, read, pop, to, push;
      words >> from >> read >> pop >> to >> push;
      moves.push_back({from, symbol(read), symbol(pop), to, push == "eps" ? "" : push});
    } else if (op == "run") {
      std::string word;
      words >> word;  // stays empty for the empty word
      int k = Pda(start, accept, moves, stack, byStack).run(word);
      if (k >= 0)
        std::cout << "accept " << k << "\n";
      else
        std::cout << (k == Pda::REJECT ? "reject" : "stopped") << "\n";
    }
  }
  return 0;
}
