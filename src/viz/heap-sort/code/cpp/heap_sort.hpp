#pragma once
#include <cstddef>
#include <utility>
#include <vector>

// Sift a[i] down the heap a[0..size-1] until neither child is bigger.
// Vectors start at 0, so this is the page's "from 0" indexing: the children
// of a[i] are a[2i + 1] and a[2i + 2].
inline void max_heapify(std::vector<int>& a, std::size_t i, std::size_t size) {
  while (true) {
    const std::size_t left = 2 * i + 1;
    const std::size_t right = 2 * i + 2;
    std::size_t largest = i;
    if (left < size && a[left] > a[largest]) {
      largest = left;
    }
    if (right < size && a[right] > a[largest]) {
      largest = right;
    }
    if (largest == i) {
      return;
    }
    std::swap(a[i], a[largest]);
    i = largest;
  }
}

// Heap sort, smallest first. a[0..size-1] is the heap and the rest is the
// sorted part.
inline void heap_sort(std::vector<int>& a) {
  const std::size_t n = a.size();
  // Phase 1: build a max-heap, from the last node with a child back to the root.
  for (std::size_t i = n / 2; i-- > 0;) {
    max_heapify(a, i, n);
  }
  // Phase 2: move the largest value to the end, shrink the heap, fix the root.
  for (std::size_t last = n; last-- > 1;) {
    std::swap(a[0], a[last]);
    max_heapify(a, 0, last);
  }
}
