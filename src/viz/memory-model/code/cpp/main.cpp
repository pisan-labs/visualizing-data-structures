// Test driver: reads one statement per line and prints the variables after each one.
#include <iostream>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <variant>
#include <vector>

#include "aliasing.hpp"

using Value = std::variant<int, List>;
using Env = std::vector<std::pair<std::string, Value>>;

static Value& get(Env& env, const std::string& name) {
  for (auto& [n, v] : env)
    if (n == name) return v;
  throw std::runtime_error("undefined " + name);
}

static void put(Env& env, const std::string& name, Value v) {
  for (auto& [n, old] : env)
    if (n == name) {
      old = std::move(v);
      return;
    }
  env.emplace_back(name, std::move(v));
}

static std::string show(const Env& env) {
  if (env.empty()) return "(empty)";
  std::ostringstream out;
  for (std::size_t i = 0; i < env.size(); i++) {
    out << (i ? " " : "") << env[i].first << "=";
    if (const int* n = std::get_if<int>(&env[i].second)) {
      out << *n;
    } else {
      const auto& xs = *std::get<List>(env[i].second);
      out << "[";
      for (std::size_t k = 0; k < xs.size(); k++) out << (k ? "," : "") << xs[k];
      out << "]";
    }
  }
  return out.str();
}

int main() {
  const std::regex append(R"((\w+)\.append\((-?\d+)\))"), set(R"((\w+)\[(\d+)\] = (-?\d+))"),
      call(R"((\w+)\((\w+)\))"), list(R"((\w+) = \[(.*)\])"), num(R"((\w+) = (-?\d+))"),
      copy(R"((\w+) = (\w+))");
  Env env;
  std::string line;
  std::smatch m;
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    if (line == "clear") {
      env.clear();
    } else if (std::regex_match(line, m, append)) {
      std::get<List>(get(env, m[1]))->push_back(std::stoi(m[2]));
    } else if (std::regex_match(line, m, set)) {
      (*std::get<List>(get(env, m[1])))[std::stoul(m[2].str())] = std::stoi(m[3]);
    } else if (std::regex_match(line, m, call)) {
      Value& arg = get(env, m[2]);
      if (m[1] == "grow") grow(std::get<List>(arg));
      if (m[1] == "reset") reset(std::get<List>(arg));
      if (m[1] == "bump") bump(std::get<int>(arg));
    } else if (std::regex_match(line, m, list)) {
      std::vector<int> xs;
      std::istringstream items(m[2].str());
      std::string x;
      while (std::getline(items, x, ',')) xs.push_back(std::stoi(x));
      put(env, m[1], make_list(xs));
    } else if (std::regex_match(line, m, num)) {
      put(env, m[1], std::stoi(m[2]));
    } else if (std::regex_match(line, m, copy)) {
      put(env, m[1], get(env, m[2]));  // copies the shared pointer: one more reference
    }
    std::cout << show(env) << "\n";
  }
  return 0;
}
