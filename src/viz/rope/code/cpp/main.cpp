// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>

#include "rope.hpp"

const int MAX_LEN = 40, MAX_PIECE = 12;  // the page's limits

int main() {
  int leaf = 4;
  Rope rope;
  std::optional<Rope> other;
  std::string line;
  while (std::getline(std::cin, line)) {
    size_t sp = line.find(' ');
    std::string op = line.substr(0, sp);
    std::string rest = sp == std::string::npos ? "" : line.substr(sp + 1);
    std::istringstream words(rest);
    if (op == "new") {
      words >> leaf;
    } else if (op == "build") {
      rope = Rope::of(rest, leaf);
      other.reset();
      std::cout << rope.length() << "\n";
    } else if (op == "index") {
      int i;
      words >> i;
      try {
        char c = rope.index(i);
        std::cout << '"' << c << "\"\n";
      } catch (const std::out_of_range&) {
        std::cout << "invalid\n";
      }
    } else if (op == "append") {
      int n = static_cast<int>(rest.size());
      if (rope.length() + n > MAX_LEN || n > MAX_PIECE) {
        std::cout << "invalid\n";
      } else {
        rope.append(rest);
        std::cout << rope.length() << "\n";
      }
    } else if (op == "insert") {
      int i;
      std::string text;
      words >> i >> text;
      int n = static_cast<int>(text.size());
      if (other || rope.length() + n > MAX_LEN || n > MAX_PIECE) {
        std::cout << "invalid\n";
        continue;
      }
      try {
        rope.insert(i, text);
        std::cout << rope.length() << "\n";
      } catch (const std::out_of_range&) {
        std::cout << "invalid\n";
      }
    } else if (op == "delete") {
      int i, n;
      words >> i >> n;
      try {
        if (other) throw std::out_of_range("join first");
        rope.remove(i, n);
        std::cout << rope.length() << "\n";
      } catch (const std::out_of_range&) {
        std::cout << "invalid\n";
      }
    } else if (op == "split") {
      int i;
      words >> i;
      try {
        if (other) throw std::out_of_range("join first");
        other = rope.split_at(i);
        std::cout << rope.length() << " " << other->length() << "\n";
      } catch (const std::out_of_range&) {
        std::cout << "invalid\n";
      }
    } else if (op == "join") {
      if (!other) {
        std::cout << "none\n";
      } else {
        rope.join(*other);
        other.reset();
        std::cout << rope.length() << "\n";
      }
    } else if (op == "clear") {
      rope = Rope();
      other.reset();
      std::cout << "ok\n";
    }
  }
  return 0;
}
