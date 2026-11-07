// Test driver: reads one operation per line, prints one result per line.
//   load S0 -> U1 S1 | eps; ...   loads a grammar in CNF, symbols separated by spaces
//   parse aabb                    prints "yes" or "no", then the variables in the top cell
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "cyk.hpp"

static std::string trim(const std::string& s) {
  size_t a = s.find_first_not_of(" \r\t");
  size_t b = s.find_last_not_of(" \r\t");
  return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

int main() {
  std::vector<Rule> rules;
  std::vector<std::string> order{"S"};
  std::string line;
  while (std::getline(std::cin, line)) {
    line = trim(line);
    size_t space = line.find(' ');
    std::string op = line.substr(0, space);
    std::string arg = space == std::string::npos ? "" : trim(line.substr(space + 1));
    if (op == "load") {
      rules.clear();
      order.clear();
      std::stringstream items(arg);
      std::string item;
      while (std::getline(items, item, ';')) {
        size_t arrow = item.find("->");
        std::string head = trim(item.substr(0, arrow));
        order.push_back(head);
        std::stringstream alts(item.substr(arrow + 2));
        std::string alt;
        while (std::getline(alts, alt, '|')) {
          std::stringstream symbols(alt);
          std::vector<std::string> body;
          for (std::string s; symbols >> s;) body.push_back(s);
          if (body.size() == 1 && body[0] == "eps") body.clear();
          rules.push_back({head, body});
        }
      }
    } else if (op == "parse") {
      std::vector<std::string> word;
      if (arg != "eps")
        for (char c : arg) word.push_back(std::string(1, c));
      std::cout << (cyk_accepts(rules, order[0], word) ? "yes" : "no");
      if (!word.empty()) {
        auto table = cyk_table(rules, word);
        const Cell& top = table[word.size()][0];
        for (const std::string& v : order)
          if (top.count(v)) std::cout << " " << v;
      }
      std::cout << "\n";
    }
  }
  return 0;
}
