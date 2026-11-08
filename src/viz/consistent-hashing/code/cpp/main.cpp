// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "hash_ring.hpp"

int main() {
  std::unique_ptr<HashRing> ring;
  std::vector<int> keys;  // the keys stored, in the order they were added
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "new") {
      ring = std::make_unique<HashRing>(std::stoi(arg));
    } else if (op == "addKey" || op == "lookup") {
      int k = std::stoi(arg);
      if (op == "addKey" && std::find(keys.begin(), keys.end(), k) == keys.end()) keys.push_back(k);
      char s = ring->lookup(k);
      std::cout << (s ? std::string(1, s) : "none") << "\n";
    } else if (op == "addServer" || op == "removeServer") {
      std::map<int, char> before;
      for (int k : keys) before[k] = ring->lookup(k);
      if (op == "addServer") {
        ring->addServer(arg[0]);
      } else {
        ring->removeServer(arg[0]);
      }
      std::string moved;
      for (int k : keys) {
        if (ring->lookup(k) != before[k]) moved += (moved.empty() ? "" : " ") + std::to_string(k);
      }
      std::cout << (moved.empty() ? "none" : moved) << "\n";
    } else if (op == "clear") {
      keys.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
