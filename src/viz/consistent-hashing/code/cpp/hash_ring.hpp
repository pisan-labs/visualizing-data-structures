#pragma once
#include <map>
#include <string>
#include <utility>

// Consistent hashing: a key belongs to the first server node clockwise from h(k).
class HashRing {
 public:
  explicit HashRing(int vnodes) : v_(vnodes) {}

  static int keyPos(int k) { return (71 * k + 5) % 1009 % kRing; }

  static int nodePos(char server, int r) {
    int token = 100 * (std::string(kNames).find(server) + 1) + r;
    return (113 * token + 17) % 1009 % kRing;
  }

  void addServer(char server) {
    for (int r = 0; r < v_; r++) {
      std::string label = v_ == 1 ? std::string(1, server) : std::string(1, server) + std::to_string(r + 1);
      nodes_[{nodePos(server, r), label}] = server;
    }
  }

  void removeServer(char server) {
    for (auto it = nodes_.begin(); it != nodes_.end();) {
      it = it->second == server ? nodes_.erase(it) : std::next(it);
    }
  }

  // The server that holds k, or 0 when there are no servers.
  char lookup(int k) const {
    if (nodes_.empty()) return 0;
    auto it = nodes_.lower_bound({keyPos(k), ""});
    return (it != nodes_.end() ? it : nodes_.begin())->second;  // past the last node: wrap
  }

 private:
  static constexpr int kRing = 360;
  static constexpr const char* kNames = "ABCDEFGH";

  int v_;
  // Nodes sorted by (position, label); the value is the server.
  std::map<std::pair<int, std::string>, char> nodes_;
};
