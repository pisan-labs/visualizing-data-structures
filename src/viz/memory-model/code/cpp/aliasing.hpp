#pragma once
#include <memory>
#include <utility>
#include <vector>

// Python and Java variables hold references to lists. The C++ way to get the same thing is a
// shared pointer: copying it copies the reference, and both copies point at one vector.
// (A plain std::vector<int> b = a; copies every value instead. Switch the page to C++ mode.)
using List = std::shared_ptr<std::vector<int>>;

inline List make_list(std::vector<int> values) {
  return std::make_shared<std::vector<int>>(std::move(values));
}

// Changes the list the caller's variable refers to.
inline void grow(List a) { a->push_back(0); }

// Points only this function's a at a new list; the caller's variable is untouched.
inline List reset(List a) {
  a = make_list({0});
  return a;
}

// Changes only this function's n.
inline int bump(int n) {
  n = n + 1;
  return n;
}
