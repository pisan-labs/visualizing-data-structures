#pragma once
#include <algorithm>
#include <memory>
#include <string>
#include <vector>

// A prefix cache: a radix tree of token runs, each with its keys and values.
struct Node {
    int uid;
    std::vector<std::string> tokens;  // the run of tokens on the edge into this node
    Node* parent;
    std::vector<std::unique_ptr<Node>> children;  // in the order they were added
    int ref = 0;   // running requests whose path passes through here
    int last = 0;  // when a request last used it
};

struct Result {
    Node* node;  // its last node
    int matched;
    int evicted;
};

class RadixCache {
public:
    explicit RadixCache(int capacity) : capacity_(capacity) {}

    Node* root() { return &root_; }

    // Reuse the longest cached prefix and cache the rest; matched = -1 if it must wait.
    Result request(const std::vector<std::string>& tokens) {
        Node* node = &root_;
        size_t i = 0;
        while (i < tokens.size()) {
            Node* c = child(node, tokens[i]);
            if (!c) break;
            size_t k = 0;
            while (k < c->tokens.size() && i + k < tokens.size() && c->tokens[k] == tokens[i + k])
                k++;
            if (k < c->tokens.size()) c = split(c, k);  // the prompt leaves this edge partway
            node = c;
            i += k;
        }
        int matched = static_cast<int>(i);
        for (Node* n = node; n != &root_; n = n->parent) n->ref++;
        std::vector<std::string> rest(tokens.begin() + matched, tokens.end());
        int need = static_cast<int>(rest.size());
        if (need > capacity_ - size_ + evictable(&root_)) {
            for (Node* n = node; n != &root_; n = n->parent) n->ref--;
            return {node, -1, 0};  // the rest is in use: wait for a request to finish
        }
        clock_++;
        for (Node* n = node; n != &root_; n = n->parent) n->last = clock_;
        int evicted = 0;
        while (capacity_ - size_ < need) evicted += evict();
        if (need > 0) {  // prefill the rest, and keep its keys and values
            auto leaf = std::make_unique<Node>(Node{uids_++, rest, node, {}, 1, clock_});
            Node* raw = leaf.get();
            node->children.push_back(std::move(leaf));
            size_ += need;
            node = raw;
        }
        return {node, matched, evicted};
    }

    // The request is done; its tokens stay cached.
    void finish(Node* node) {
        clock_++;
        for (Node* n = node; n != &root_; n = n->parent) {
            n->ref--;
            n->last = clock_;
        }
    }

private:
    int capacity_;  // tokens it can hold
    Node root_{0, {}, nullptr, {}, 0, 0};
    int uids_ = 1;
    int size_ = 0;  // tokens it holds
    int clock_ = 0;

    static Node* child(Node* node, const std::string& token) {
        for (auto& c : node->children)
            if (c->tokens[0] == token) return c.get();
        return nullptr;
    }

    // Cut node's edge after k tokens: a new node takes the first k.
    Node* split(Node* node, size_t k) {
        Node* parent = node->parent;
        auto& slot = *std::find_if(parent->children.begin(), parent->children.end(),
                                   [&](const std::unique_ptr<Node>& c) { return c.get() == node; });
        std::vector<std::string> head(node->tokens.begin(), node->tokens.begin() + k);
        auto top = std::make_unique<Node>(Node{uids_++, head, parent, {}, node->ref, node->last});
        node->tokens.erase(node->tokens.begin(), node->tokens.begin() + k);
        node->parent = top.get();
        top->children.push_back(std::move(slot));
        slot = std::move(top);
        return slot.get();
    }

    static int evictable(const Node* node) {
        int total = node->ref == 0 ? static_cast<int>(node->tokens.size()) : 0;
        for (auto& c : node->children) total += evictable(c.get());
        return total;
    }

    // The least recently used leaf that no running request uses, below node.
    Node* oldest(Node* node, Node* best) {
        for (auto& c : node->children) {
            Node* n = c.get();
            if (n->children.empty()) {
                if (n->ref == 0 && (!best || n->last < best->last ||
                                    (n->last == best->last && n->uid < best->uid)))
                    best = n;
            } else {
                best = oldest(n, best);
            }
        }
        return best;
    }

    int evict() {
        Node* leaf = oldest(&root_, nullptr);
        int freed = static_cast<int>(leaf->tokens.size());
        auto& kids = leaf->parent->children;
        kids.erase(std::find_if(kids.begin(), kids.end(),
                                [&](const std::unique_ptr<Node>& c) { return c.get() == leaf; }));
        size_ -= freed;
        return freed;
    }
};
