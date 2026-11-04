// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "doubly_linked_list.hpp"

int main() {
  DoublyLinkedList<std::string> list;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, a, b;
    if (!(words >> op)) continue;
    words >> a >> b;
    try {
      if (op == "insertHead") {
        list.insertHead(a);
        std::cout << "ok\n";
      } else if (op == "insertTail") {
        list.insertTail(a);
        std::cout << "ok\n";
      } else if (op == "insertAt") {
        list.insertAt(std::stoi(a), b);
        std::cout << "ok\n";
      } else if (op == "removeHead") {
        std::cout << list.removeHead() << "\n";
      } else if (op == "removeTail") {
        std::cout << list.removeTail() << "\n";
      } else if (op == "removeAt") {
        std::cout << list.removeAt(std::stoi(a)) << "\n";
      } else if (op == "removeValue") {
        std::cout << (list.removeValue(a) ? "true" : "false") << "\n";
      } else if (op == "search") {
        std::cout << list.search(a) << "\n";
      } else if (op == "get") {
        std::cout << list.get(std::stoi(a)) << "\n";
      } else if (op == "reverse") {
        list.reverse();
        std::cout << "ok\n";
      } else if (op == "print") {
        std::string all;
        list.forEach([&all](const std::string& v) { all += (all.empty() ? "" : " ") + v; });
        std::cout << (all.empty() ? "empty" : all) << "\n";
      }
    } catch (const std::underflow_error&) {
      std::cout << "empty\n";
    } catch (const std::out_of_range&) {
      std::cout << "index error\n";
    }
  }
  return 0;
}
