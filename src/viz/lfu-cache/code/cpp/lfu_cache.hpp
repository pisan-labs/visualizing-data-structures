#pragma once
#include <list>
#include <map>
#include <optional>
#include <unordered_map>

// Evicts the key used the fewest times; on a tie, the least recently used of them. entries maps
// a key to its value, its frequency and its place in the list for that frequency. lists maps each
// frequency f to the keys used f times, least recently used first, as doubly linked lists, so
// unlinking a key (through its iterator) and taking the oldest are both O(1). minFreq is the
// smallest frequency in use.
class LFUCache {
    struct Entry {
        int value;
        int freq;
        std::list<int>::iterator at;
    };
    int capacity;
    std::unordered_map<int, Entry> entries;
    std::unordered_map<int, std::list<int>> lists;
    int minFreq_ = 0;

    // Moves k from the list for its frequency to the tail of the next one.
    void bump(Entry& e, int k) {
        std::list<int>& list = lists[e.freq];
        list.erase(e.at);
        if (list.empty()) {
            lists.erase(e.freq);
            if (minFreq_ == e.freq) ++minFreq_;
        }
        ++e.freq;
        std::list<int>& next = lists[e.freq];
        e.at = next.insert(next.end(), k);
    }

  public:
    int hits = 0, misses = 0;

    explicit LFUCache(int capacity) : capacity(capacity) {}

    int get(int k) {
        auto it = entries.find(k);
        if (it == entries.end()) {
            ++misses;
            return -1;
        }
        ++hits;
        bump(it->second, k);
        return it->second.value;
    }

    // Stores v under k. Returns the key it evicted, if any.
    std::optional<int> put(int k, int v) {
        auto it = entries.find(k);
        if (it != entries.end()) {
            it->second.value = v;
            bump(it->second, k);
            return std::nullopt;
        }
        std::optional<int> evicted;
        if (static_cast<int>(entries.size()) == capacity) {
            std::list<int>& oldest = lists[minFreq_];
            evicted = oldest.front();
            oldest.pop_front();
            if (oldest.empty()) lists.erase(minFreq_);
            entries.erase(*evicted);
        }
        std::list<int>& ones = lists[1];
        entries[k] = Entry{v, 1, ones.insert(ones.end(), k)};
        minFreq_ = 1;
        return evicted;
    }

    bool contains(int k) const { return entries.count(k) > 0; }
    int minFreq() const { return minFreq_; }

    // The lists by frequency, lowest first, each least recently used first.
    std::map<int, std::list<int>> byFrequency() const { return {lists.begin(), lists.end()}; }
};
