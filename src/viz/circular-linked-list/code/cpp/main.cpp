// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "circular_list.hpp"

int main() {
  CircularLinkedList<std::string> list;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "insertFront") {
      list.insertFront(arg);
      std::cout << "ok\n";
    } else if (op == "insertBack") {
      list.insertBack(arg);
      std::cout << "ok\n";
    } else if (op == "removeFront") {
      try {
        std::cout << list.removeFront() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "rotate") {
      list.rotate();
      std::cout << "ok\n";
    } else if (op == "traverse") {
      std::string all;
      for (const std::string& v : list.traverse()) all += (all.empty() ? "" : " ") + v;
      std::cout << (all.empty() ? "empty" : all) << "\n";
    } else if (op == "search") {
      std::cout << list.search(arg) << "\n";
    }
  }
  return 0;
}
