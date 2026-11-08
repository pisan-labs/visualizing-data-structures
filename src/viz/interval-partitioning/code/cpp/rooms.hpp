#include <algorithm>
#include <functional>
#include <numeric>
#include <queue>
#include <utility>
#include <vector>

// Gives each lecture a room, using as few rooms as possible. Each lecture is a (start, finish)
// pair, half-open. Returns the room (from 1) of each lecture; the largest is the count.
std::vector<int> assign_rooms(const std::vector<std::pair<int, int>>& lectures) {
  std::vector<int> order(lectures.size());
  std::iota(order.begin(), order.end(), 0);
  std::stable_sort(order.begin(), order.end(),
                   [&](int a, int b) { return lectures[a].first < lectures[b].first; });
  // Rooms in use as (time free, room), the one free soonest on top.
  std::priority_queue<std::pair<int, int>, std::vector<std::pair<int, int>>, std::greater<>> free_at;
  std::vector<int> room(lectures.size());
  int rooms = 0;
  for (int k : order) {
    int r;
    if (!free_at.empty() && free_at.top().first <= lectures[k].first) {
      r = free_at.top().second;  // reuse the room free soonest
      free_at.pop();
    } else {
      r = ++rooms;  // open a new room
    }
    room[k] = r;
    free_at.emplace(lectures[k].second, r);
  }
  return room;
}
