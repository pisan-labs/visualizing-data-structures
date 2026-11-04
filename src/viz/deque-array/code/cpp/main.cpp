// Test driver: reads one operation per line, prints one result per line.
#include <functional>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "array_deque.hpp"

using Deque = ArrayDeque<std::string>;

static std::string add(const std::function<void()>& op) {
  try {
    op();
    return "ok";
  } catch (const std::overflow_error&) {
    return "overflow";
  }
}

static std::string take(const std::function<std::string()>& op, const std::string& error) {
  try {
    return op();
  } catch (const std::underflow_error&) {
    return error;
  }
}

int main() {
  std::unique_ptr<Deque> deque;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    Deque* d = deque.get();
    if (op == "new") {
      deque = std::make_unique<Deque>(std::stoi(arg));
    } else if (op == "addFirst") {
      std::cout << add([&] { d->add_first(arg); }) << "\n";
    } else if (op == "addLast") {
      std::cout << add([&] { d->add_last(arg); }) << "\n";
    } else if (op == "removeFirst") {
      std::cout << take([&] { return d->remove_first(); }, "underflow") << "\n";
    } else if (op == "removeLast") {
      std::cout << take([&] { return d->remove_last(); }, "underflow") << "\n";
    } else if (op == "peekFirst") {
      std::cout << take([&] { return d->peek_first(); }, "empty") << "\n";
    } else if (op == "peekLast") {
      std::cout << take([&] { return d->peek_last(); }, "empty") << "\n";
    } else {
      std::cerr << "unknown operation " << op << "\n";
      return 1;
    }
  }
  return 0;
}
