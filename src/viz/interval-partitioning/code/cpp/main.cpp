// Test driver: "rooms s1-f1 s2-f2 ..." prints the number of rooms, then each lecture's room in
// the order typed.
#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "rooms.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, pair;
    if (!(words >> op) || op != "rooms") continue;
    std::vector<std::pair<int, int>> lectures;
    while (words >> pair) {
      const auto dash = pair.find('-');
      lectures.emplace_back(std::stoi(pair.substr(0, dash)), std::stoi(pair.substr(dash + 1)));
    }
    if (lectures.empty()) continue;
    const auto room = assign_rooms(lectures);
    std::cout << *std::max_element(room.begin(), room.end());
    for (int r : room) std::cout << ' ' << r;
    std::cout << "\n";
  }
  return 0;
}
