// Test driver: reads one operation per line, prints one result per line.
//   load S -> aSb | eps   loads a grammar (prints nothing)
//   derive aabb           prints "S => aSb => aaSbb => aabb", or "no", or "gave up"
#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>

#include "derivation.hpp"

static std::string trim(const std::string& s) {
  size_t a = s.find_first_not_of(" \r\t");
  size_t b = s.find_last_not_of(" \r\t");
  return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}

int main() {
  Rules rules;
  char start = 'S';
  std::string line;
  while (std::getline(std::cin, line)) {
    line = trim(line);
    size_t space = line.find(' ');
    std::string op = line.substr(0, space);
    std::string arg = space == std::string::npos ? "" : trim(line.substr(space + 1));
    if (op == "load") {
      rules.clear();
      start = 0;
      std::stringstream items(arg);
      std::string item;
      while (std::getline(items, item, ';')) {
        size_t arrow = item.find("->");
        char head = trim(item.substr(0, arrow))[0];
        if (!start) start = head;
        std::string body = item.substr(arrow + 2) + "|";
        auto& bodies = rules[head];
        size_t from = 0;
        for (size_t bar; (bar = body.find('|', from)) != std::string::npos; from = bar + 1) {
          std::string alt;
          for (char c : body.substr(from, bar - from))
            if (c != ' ') alt += c;
          if (alt == "eps") alt = "";
          if (std::find(bodies.begin(), bodies.end(), alt) == bodies.end()) bodies.push_back(alt);
        }
      }
    } else if (op == "derive") {
      std::string word = arg == "eps" ? "" : arg;
      Derivation d = leftmost_derivation(rules, start, word);
      if (d.gave_up) {
        std::cout << "gave up\n";
      } else if (d.forms.empty()) {
        std::cout << "no\n";
      } else {
        for (size_t k = 0; k < d.forms.size(); k++)
          std::cout << (k ? " => " : "") << (d.forms[k].empty() ? "eps" : d.forms[k]);
        std::cout << "\n";
      }
    }
  }
  return 0;
}
