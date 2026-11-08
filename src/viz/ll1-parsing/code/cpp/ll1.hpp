// LL(1) parsing: FIRST and FOLLOW sets, the parse table, and a predictive parse.
#pragma once
#include <cctype>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

const std::string EPS = "eps", END = "$";

using Body = std::vector<std::string>;
using Rule = std::pair<std::string, Body>;  // head -> body; an empty body is eps
using Set = std::set<std::string>;

inline bool isVar(const std::string& s) { return std::isupper(static_cast<unsigned char>(s[0])); }

struct Ll1 {
    std::vector<Rule> rules;
    std::map<std::string, Set> first, follow;
    // table[{head, a}] lists the rules for that cell; two or more is a conflict.
    std::map<std::pair<std::string, std::string>, std::vector<size_t>> table;

    Set firstOf(Body::const_iterator from, Body::const_iterator to) {
        Set out;
        for (; from != to; ++from) {
            if (!isVar(*from)) {
                out.insert(*from);
                return out;
            }
            for (auto& x : first[*from])
                if (x != EPS) out.insert(x);
            if (!first[*from].count(EPS)) return out;
        }
        out.insert(EPS);
        return out;
    }

    static bool addAll(Set& to, const Set& from) {
        size_t before = to.size();
        to.insert(from.begin(), from.end());
        return to.size() > before;
    }

    Ll1(std::vector<Rule> rs, const std::vector<std::string>& variables) : rules(std::move(rs)) {
        for (auto& v : variables) first[v], follow[v];
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
                    Set rest = firstOf(k + 1, b.end());
                    if (rest.erase(EPS)) addAll(rest, follow[h]);
                    changed |= addAll(follow[*k], rest);
                }
        }
        for (size_t i = 0; i < rules.size(); i++) {
            auto& [h, b] = rules[i];
            Set cols = firstOf(b.begin(), b.end());
            if (cols.erase(EPS)) addAll(cols, follow[h]);
            for (auto& a : cols) table[{h, a}].push_back(i);
        }
    }

    int conflicts() const {
        int n = 0;
        for (auto& [cell, rs] : table) n += rs.size() > 1;
        return n;
    }

    // Returns "accept", "reject" or "gave-up", then the moves made. Takes the first rule in a cell.
    std::string parse(const std::string& word, int cap) {
        std::vector<std::string> stack = {END, rules[0].first}, in;
        for (char c : word) in.push_back(std::string(1, c));
        in.push_back(END);
        size_t pos = 0;
        int moves = 0;
        while (true) {
            std::string top = stack.back(), a = in[pos];
            if (top == END && a == END) return "accept " + std::to_string(moves);
            if (moves >= cap) return "gave-up " + std::to_string(moves);
            if (!isVar(top)) {
                if (top != a) return "reject " + std::to_string(moves);
                stack.pop_back();
                pos++;
            } else {
                auto cell = table.find({top, a});
                if (cell == table.end()) return "reject " + std::to_string(moves);
                stack.pop_back();
                auto& body = rules[cell->second[0]].second;
                stack.insert(stack.end(), body.rbegin(), body.rend());
            }
            moves++;
        }
    }
};
