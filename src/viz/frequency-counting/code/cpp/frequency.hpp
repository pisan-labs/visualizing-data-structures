#pragma once
#include <string>
#include <unordered_map>
#include <vector>

// The 26 letter counts of a lowercase word, one char per letter: a string a hash map can key on.
inline std::string counts(const std::string& word) {
    std::string count(26, '\0');
    for (char ch : word) ++count[ch - 'a'];
    return count;
}

// Lists of the words that are anagrams of each other, in the order each group starts.
inline std::vector<std::vector<std::string>> groupAnagrams(const std::vector<std::string>& words) {
    std::unordered_map<std::string, std::size_t> group;  // key: all 26 counts -> its group
    std::vector<std::vector<std::string>> groups;
    for (const std::string& w : words) {
        auto [it, fresh] = group.try_emplace(counts(w), groups.size());
        if (fresh) groups.emplace_back();
        groups[it->second].push_back(w);
    }
    return groups;
}

// The index of the first letter of s that appears only once, or -1. Two passes, O(n).
inline int firstUnique(const std::string& s) {
    std::string count = counts(s);
    for (std::size_t i = 0; i < s.size(); ++i) {
        if (count[s[i] - 'a'] == 1) return static_cast<int>(i);
    }
    return -1;
}
