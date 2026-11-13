#pragma once
#include <algorithm>
#include <map>
#include <string>
#include <vector>

// A paged KV cache: a pool of fixed-size blocks, a free list, and a block table per request
// that maps its logical blocks to physical ones. Only how full each block is matters here; a
// real cache stores a key and a value per slot.
class BlockManager {
public:
    BlockManager(int num_blocks, int block_size, int max_len, bool sharing)
        : block_size_(block_size), max_len_(max_len), sharing_(sharing),
          ref(num_blocks, 0), filled(num_blocks, 0) {
        for (int p = num_blocks - 1; p >= 0; p--) free.push_back(p);  // free.back() is the top
    }

    // A request with a prompt of n tokens: one block per block_size tokens.
    void add(char name, int n) {
        std::vector<int> table;
        for (int start = 0; start < n; start += block_size_) {
            int p = pop();
            filled[p] = std::min(block_size_, n - start);
            table.push_back(p);
        }
        tables[name] = table;
        lengths[name] = n;
    }

    // Write one more token. Returns false if no block is free and it must wait.
    bool append_token(char name) {
        std::vector<int>& table = tables[name];
        int last = table.back();
        if (filled[last] == block_size_) {  // full: take a new block
            if (free.empty()) return false;
            table.push_back(pop());
        } else if (ref[last] > 1) {  // shared: copy on write
            if (free.empty()) return false;
            int p = pop();
            filled[p] = filled[last];  // copy its keys and values
            ref[last]--;
            table.back() = p;
            copies++;
        }
        filled[table.back()]++;
        lengths[name]++;
        return true;
    }

    // One token for every running request, oldest first (letters are handed out in order).
    void step() {
        for (auto& [name, table] : tables)
            if (lengths[name] < max_len_) append_token(name);
    }

    // Lower each block's count; a block no one uses goes back on the free list.
    void finish(char name) {
        std::vector<int>& table = tables[name];
        for (auto it = table.rbegin(); it != table.rend(); ++it)  // last first
            if (--ref[*it] == 0) free.push_back(*it);
        tables.erase(name);
        lengths.erase(name);
    }

    // Parallel sampling: a second answer to the same prompt.
    void fork(char parent, char child) {
        std::vector<int> table;
        for (int p : tables[parent]) {
            if (sharing_) {  // the same blocks
                ref[p]++;
                table.push_back(p);
            } else {  // a copy of every block
                int q = pop();
                filled[q] = filled[p];
                table.push_back(q);
                copies++;
            }
        }
        tables[child] = table;
        lengths[child] = lengths[parent];
    }

    std::vector<int> free;  // a stack
    std::map<char, std::vector<int>> tables;
    int copies = 0;

private:
    int pop() {
        int p = free.back();
        free.pop_back();
        ref[p] = 1;
        filled[p] = 0;
        return p;
    }

    int block_size_, max_len_;
    bool sharing_;
    std::vector<int> ref;     // how many block tables point at each block
    std::vector<int> filled;  // tokens in each block
    std::map<char, int> lengths;
};
