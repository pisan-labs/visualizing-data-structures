// Test driver: reads one operation per line, prints one result per line.
#include <functional>
#include <iostream>
#include <sstream>
#include <string>

#include "linked_deque.hpp"

static std::string take(const std::function<std::string()>& op, const std::string& error) {
  try {
    return op();
  } catch (const std::underflow_error&) {
    return error;
  }
}

int main() {
  LinkedDeque<std::string> deque;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "addFirst") {
      deque.add_first(arg);
      std::cout << "ok\n";
    } else if (op == "addLast") {
      deque.add_last(arg);
      std::cout << "ok\n";
    } else if (op == "removeFirst") {
      std::cout << take([&] { return deque.remove_first(); }, "underflow") << "\n";
    } else if (op == "removeLast") {
      std::cout << take([&] { return deque.remove_last(); }, "underflow") << "\n";
    } else if (op == "peekFirst") {
      std::cout << take([&] { return deque.peek_first(); }, "empty") << "\n";
    } else if (op == "peekLast") {
      std::cout << take([&] { return deque.peek_last(); }, "empty") << "\n";
    } else {
      std::cerr << "unknown operation " << op << "\n";
      return 1;
    }
  }
  return 0;
}
