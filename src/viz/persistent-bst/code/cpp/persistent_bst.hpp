#pragma once
#include <memory>
#include <vector>

// Every update makes a new version by copying one path; old versions stay.
class PersistentBST {
 public:
  // Never changed after it is made, so versions can share it (shared_ptr frees what no
  // version uses any more).
  struct Node {
    int key;
    std::shared_ptr<const Node> left, right;
  };
  using Ptr = std::shared_ptr<const Node>;

  std::vector<Ptr> versions{nullptr};  // versions[v] is the root of version v
  int made = 0;                        // nodes made by the last update

  bool search(int v, int k) const {
    const Node* x = versions[v].get();
    while (x != nullptr && k != x->key) x = k < x->key ? x->left.get() : x->right.get();
    return x != nullptr;
  }

  // Insert k into version v. Returns the new version's number, or -1.
  int insert(int v, int k) {
    if (search(v, k)) return -1;
    made = 0;
    versions.push_back(insert(versions[v], k));
    return static_cast<int>(versions.size()) - 1;
  }

  // Delete k from version v. Returns the new version's number, or -1.
  int remove(int v, int k) {
    if (!search(v, k)) return -1;
    made = 0;
    versions.push_back(remove(versions[v], k));
    return static_cast<int>(versions.size()) - 1;
  }

 private:
  Ptr node(int key, Ptr left, Ptr right) {
    made++;
    return std::make_shared<const Node>(Node{key, std::move(left), std::move(right)});
  }

  Ptr insert(const Ptr& x, int k) {
    if (!x) return node(k, nullptr, nullptr);
    if (k < x->key) return node(x->key, insert(x->left, k), x->right);  // copy x
    return node(x->key, x->left, insert(x->right, k));
  }

  Ptr remove(const Ptr& x, int k) {
    if (k < x->key) return node(x->key, remove(x->left, k), x->right);
    if (k > x->key) return node(x->key, x->left, remove(x->right, k));
    if (!x->left) return x->right;  // shared as it is
    if (!x->right) return x->left;
    const Node* y = x->right.get();
    while (y->left) y = y->left.get();
    // A copy of the successor takes x's place; copy the path down to it.
    return node(y->key, x->left, withoutMin(x->right));
  }

  Ptr withoutMin(const Ptr& x) {
    if (!x->left) return x->right;
    return node(x->key, withoutMin(x->left), x->right);
  }
};
