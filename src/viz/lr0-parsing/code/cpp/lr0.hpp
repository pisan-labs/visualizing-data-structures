// LR(0) and SLR(1) parsing: item sets, the ACTION/GOTO table, and a shift-reduce parse.
#pragma once
#include <algorithm>
#include <cctype>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

const std::string END = "$";

using Body = std::vector<std::string>;
using Rule = std::pair<std::string, Body>;  // head -> body; rules[0] is the augmented S' -> S
using Item = std::pair<size_t, size_t>;      // a rule and the position of its dot
using Act = std::pair<char, size_t>;         // 's' shift to n, 'r' reduce by rule n, 'a' accept
using Sets = std::map<std::string, std::set<std::string>>;

inline bool isVar(const std::string& s) { return std::isupper(static_cast<unsigned char>(s[0])); }

struct Lr0 {
    std::vector<Rule> rules;
    std::vector<std::vector<Item>> sets;
    std::vector<std::pair<std::pair<size_t, std::string>, size_t>> edges;
    std::map<std::pair<size_t, std::string>, size_t> gotoT;
    std::map<std::pair<size_t, std::string>, std::vector<Act>> action;

    const std::string* next(const Item& it) const {
        auto& b = rules[it.first].second;
        return it.second < b.size() ? &b[it.second] : nullptr;
    }

    std::vector<Item> closure(std::vector<Item> out) const {
        for (size_t k = 0; k < out.size(); k++) {
            auto b = next(out[k]);
            if (!b || !isVar(*b)) continue;
            for (size_t r = 0; r < rules.size(); r++)
                if (rules[r].first == *b && std::find(out.begin(), out.end(), Item{r, 0}) == out.end())
                    out.push_back({r, 0});
        }
        return out;
    }

    Lr0(std::vector<Rule> rs, const Sets* follow) : rules(std::move(rs)) {
        sets.push_back(closure({{0, 0}}));
        for (size_t i = 0; i < sets.size(); i++) {
            std::vector<std::string> symbols;
            for (auto& it : sets[i])
                if (auto x = next(it); x && std::find(symbols.begin(), symbols.end(), *x) == symbols.end())
                    symbols.push_back(*x);
            for (auto& x : symbols) {
                std::vector<Item> kernel;
                for (auto& it : sets[i])
                    if (auto y = next(it); y && *y == x) kernel.push_back({it.first, it.second + 1});
                auto full = closure(kernel);
                std::set<Item> want(full.begin(), full.end());
                size_t j = 0;
                while (j < sets.size() && std::set<Item>(sets[j].begin(), sets[j].end()) != want) j++;
                if (j == sets.size()) sets.push_back(full);
                edges.push_back({{i, x}, j});
            }
        }
        std::set<std::string> terminals = {END};
        for (auto& [h, b] : rules)
            for (auto& s : b)
                if (!isVar(s)) terminals.insert(s);
        for (auto& [k, j] : edges) {
            if (isVar(k.second)) gotoT[k] = j;
            else action[k].push_back({'s', j});
        }
        for (size_t i = 0; i < sets.size(); i++)
            for (auto& it : sets[i]) {
                if (next(it)) continue;
                if (it.first == 0) {
                    action[{i, END}].push_back({'a', 0});
                    continue;
                }
                auto& cols = follow ? follow->at(rules[it.first].first) : terminals;
                for (auto& a : cols) action[{i, a}].push_back({'r', it.first});
            }
    }

    int conflicts() const {
        int n = 0;
        for (auto& [k, acts] : action) n += acts.size() > 1;
        return n;
    }

    // Returns "accept" or "reject", then the moves made.
    std::string parse(const std::string& word, int cap) const {
        std::vector<size_t> stack = {0};
        std::string in = word + END;
        size_t pos = 0;
        int moves = 0;
        while (true) {
            auto acts = action.find({stack.back(), std::string(1, in[pos])});
            if (acts == action.end() || moves >= cap) return "reject " + std::to_string(moves);
            Act act = acts->second[0];
            if (act.first == 'a') return "accept " + std::to_string(moves);
            if (act.first == 's') {
                stack.push_back(act.second);
                pos++;
            } else {
                auto& [head, body] = rules[act.second];
                stack.resize(stack.size() - body.size());
                auto to = gotoT.find({stack.back(), head});
                if (to == gotoT.end()) return "reject " + std::to_string(moves);
                stack.push_back(to->second);
            }
            moves++;
        }
    }
};

// FOLLOW of each variable, for SLR(1).
inline Sets followSets(const std::vector<Rule>& rules) {
    Sets first, follow;
    for (auto& [h, b] : rules) first[h], follow[h];
    auto firstOf = [&](Body::const_iterator from, Body::const_iterator to) {
        std::set<std::string> out;
        for (; from != to; ++from) {
            if (!isVar(*from)) {
                out.insert(*from);
                return out;
            }
            for (auto& x : first[*from])
                if (!x.empty()) out.insert(x);
            if (!first[*from].count("")) return out;
        }
        out.insert("");
        return out;
    };
    auto addAll = [](std::set<std::string>& to, const std::set<std::string>& from) {
        size_t before = to.size();
        to.insert(from.begin(), from.end());
        return to.size() > before;
    };
    for (bool changed = true; changed;) {
        changed = false;
        for (auto& [h, b] : rules) changed |= addAll(first[h], firstOf(b.begin(), b.end()));
    }
    follow[rules[0].first].insert(END);
    for (bool changed = true; changed;) {
        changed = false;
        for (auto& [h, b] : rules)
            for (auto k = b.begin(); k != b.end(); ++k) {
                if (!isVar(*k)) continue;
                auto rest = firstOf(k + 1, b.end());
                if (rest.erase("")) addAll(rest, follow[h]);
                changed |= addAll(follow[*k], rest);
            }
    }
    return follow;
}
