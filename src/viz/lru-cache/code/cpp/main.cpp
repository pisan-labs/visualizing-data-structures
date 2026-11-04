// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "lru_cache.hpp"

int main() {
  std::unique_ptr<LRUCache> cache;
  int capacity = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0, b = 0;
    words >> a >> b;
    if (op == "new") {
      capacity = a;
      cache = std::make_unique<LRUCache>(capacity);
    } else if (op == "get") {
      std::cout << cache->get(a) << "\n";
    } else if (op == "put") {
      bool existed = cache->contains(a);
      auto evicted = cache->put(a, b);
      if (existed) {
        std::cout << "updated\n";
      } else if (evicted) {
        std::cout << "evict " << *evicted << "\n";
      } else {
        std::cout << "added\n";
      }
    } else if (op == "clear") {
      cache = std::make_unique<LRUCache>(capacity);
      std::cout << "ok\n";
    } else if (op == "print") {
      std::cout << cache->show() << "\n";
    }
  }
  return 0;
}
