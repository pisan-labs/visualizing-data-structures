// Polynomial-time reductions. None of them solves anything: each one only builds a new
// instance whose answer is the same as the old one's.
#pragma once
#include <set>
#include <string>
#include <utility>
#include <vector>

using Edge = std::pair<std::string, std::string>;

struct Graph {
  std::vector<std::string> vertices;
  std::vector<Edge> edges;
  int k;
};

struct Cover {
  int m;  // the universe is 1..m
  std::vector<std::pair<std::string, std::vector<int>>> sets;
  int k;
};

inline std::string variable(const std::string& lit) { return lit[0] == '!' ? lit.substr(1) : lit; }

// 3-SAT to INDEPENDENT-SET. A clause is a list of literals such as "a" or "!b". One vertex per
// literal ("!b2" is the !b of clause 2), joined within a clause, and every x joined to every
// !x in another clause. k = number of clauses.
inline Graph satToIs(const std::vector<std::vector<std::string>>& clauses) {
  Graph g{{}, {}, (int)clauses.size()};
  std::vector<std::vector<std::string>> names;
  for (size_t j = 0; j < clauses.size(); j++) {
    std::vector<std::string> vs;
    for (const auto& lit : clauses[j]) vs.push_back(lit + std::to_string(j + 1));
    for (size_t a = 0; a < vs.size(); a++)
      for (size_t b = a + 1; b < vs.size(); b++) g.edges.push_back({vs[a], vs[b]});
    g.vertices.insert(g.vertices.end(), vs.begin(), vs.end());
    names.push_back(vs);
  }
  for (size_t i = 0; i < clauses.size(); i++)
    for (size_t j = i + 1; j < clauses.size(); j++)
      for (size_t a = 0; a < clauses[i].size(); a++)
        for (size_t b = 0; b < clauses[j].size(); b++) {
          const auto &x = clauses[i][a], &y = clauses[j][b];
          if (x != y && variable(x) == variable(y)) g.edges.push_back({names[i][a], names[j][b]});
        }
  return g;
}

// Every pair of vertices that is not an edge.
inline std::vector<Edge> complement(const Graph& g) {
  std::set<Edge> joined;
  for (const auto& [u, v] : g.edges) {
    joined.insert({u, v});
    joined.insert({v, u});
  }
  std::vector<Edge> out;
  const auto& vs = g.vertices;
  for (size_t i = 0; i < vs.size(); i++)
    for (size_t j = i + 1; j < vs.size(); j++)
      if (!joined.count({vs[i], vs[j]})) out.push_back({vs[i], vs[j]});
  return out;
}

// S is independent exactly when V - S touches every edge.
inline Graph isToVc(const Graph& g) { return {g.vertices, g.edges, (int)g.vertices.size() - g.k}; }

// S is independent in G exactly when S is a clique in the complement.
inline Graph isToClique(const Graph& g) { return {g.vertices, complement(g), g.k}; }

// S is a clique in G exactly when V - S covers the complement.
inline Graph cliqueToVc(const Graph& g) {
  return {g.vertices, complement(g), (int)g.vertices.size() - g.k};
}

// One element per edge (numbered from 1), one set per vertex: the edges it touches.
inline Cover vcToSc(const Graph& g) {
  Cover c{(int)g.edges.size(), {}, g.k};
  for (const auto& v : g.vertices) {
    std::vector<int> items;
    for (size_t i = 0; i < g.edges.size(); i++)
      if (g.edges[i].first == v || g.edges[i].second == v) items.push_back((int)i + 1);
    c.sets.push_back({v, items});
  }
  return c;
}
