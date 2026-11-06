// Test driver: reads one reduction per line, prints the new instance on one line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "reductions.hpp"

static std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  std::string part;
  std::istringstream in(s);
  while (std::getline(in, part, sep))
    if (!part.empty()) out.push_back(part);
  return out;
}

static Graph readGraph(std::istringstream& words) {
  std::map<std::string, std::string> f;
  std::string w;
  while (words >> w) {
    size_t eq = w.find('=');
    f[w.substr(0, eq)] = w.substr(eq + 1);
  }
  Graph g{split(f["V"], ','), {}, std::stoi(f["k"])};
  for (const auto& e : split(f["E"], ',')) {
    size_t dash = e.find('-');
    g.edges.push_back({e.substr(0, dash), e.substr(dash + 1)});
  }
  return g;
}

static std::string show(const Graph& g) {
  std::string vs, es;
  for (const auto& v : g.vertices) vs += (vs.empty() ? "" : ",") + v;
  for (const auto& [u, v] : g.edges) es += (es.empty() ? "" : ",") + u + "-" + v;
  return "k=" + std::to_string(g.k) + " V=" + vs + " E=" + es;
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "sat2is") {
      std::string text;
      words >> text;
      std::vector<std::vector<std::string>> clauses;
      for (const auto& c : split(text, ',')) clauses.push_back(split(c, '|'));
      std::cout << show(satToIs(clauses)) << '\n';
    } else if (op == "is2vc") {
      std::cout << show(isToVc(readGraph(words))) << '\n';
    } else if (op == "is2clique") {
      std::cout << show(isToClique(readGraph(words))) << '\n';
    } else if (op == "clique2vc") {
      std::cout << show(cliqueToVc(readGraph(words))) << '\n';
    } else if (op == "vc2sc") {
      Cover c = vcToSc(readGraph(words));
      std::cout << "k=" << c.k << " U=" << c.m;
      for (const auto& [name, items] : c.sets) {
        std::string list;
        for (int x : items) list += (list.empty() ? "" : ",") + std::to_string(x);
        std::cout << ' ' << name << "={" << list << '}';
      }
      std::cout << '\n';
    }
  }
}
