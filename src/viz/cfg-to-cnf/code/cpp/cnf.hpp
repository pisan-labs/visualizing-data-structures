// Convert a context-free grammar to Chomsky normal form. Variables start with a capital.
#pragma once
#include <algorithm>
#include <cctype>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

using Body = std::vector<std::string>;
using Rule = std::pair<std::string, Body>;  // head -> body; an empty body is eps

inline bool isVar(const std::string& s) { return std::isupper(static_cast<unsigned char>(s[0])); }
inline bool isUnit(const Body& b) { return b.size() == 1 && isVar(b[0]); }

class Cnf {
    std::set<std::string> used;

    std::string fresh(char letter, int k) {
        while (used.count(letter + std::to_string(k))) k++;
        used.insert(letter + std::to_string(k));
        return letter + std::to_string(k);
    }

    static bool has(const std::vector<Rule>& rules, const Rule& r) {
        return std::find(rules.begin(), rules.end(), r) != rules.end();
    }

    // TERM: a variable for each terminal in a right side of two or more symbols.
    std::vector<Rule> term(std::vector<Rule> rules) {
        std::vector<std::pair<std::string, std::string>> names;
        auto nameOf = [&](const std::string& s) -> std::string {
            for (auto& [a, u] : names)
                if (a == s) return u;
            return "";
        };
        for (auto& [h, b] : rules)
            for (auto& s : b)
                if (b.size() >= 2 && !isVar(s) && nameOf(s).empty()) names.push_back({s, fresh('U', 1)});
        for (auto& [h, b] : rules)
            if (b.size() >= 2)
                for (auto& s : b)
                    if (!nameOf(s).empty()) s = nameOf(s);
        for (auto& [a, u] : names) rules.push_back({u, {a}});
        return rules;
    }

    // BIN: break each right side of three or more symbols into a chain of pairs.
    std::vector<Rule> split(const std::vector<Rule>& rules) {
        std::vector<Rule> out;
        for (auto& [head, b] : rules) {
            std::string h = head;
            for (size_t i = 0; i + 2 < b.size(); i++) {
                std::string v = fresh(head[0], 1);
                out.push_back({h, {b[i], v}});
                h = v;
            }
            out.push_back({h, b.size() > 2 ? Body(b.end() - 2, b.end()) : b});
        }
        return out;
    }

public:
    std::vector<Rule> convert(const std::vector<Rule>& input, bool termFirst) {
        for (auto& [h, b] : input) {
            used.insert(h);
            for (auto& s : b)
                if (isVar(s)) used.insert(s);
        }
        std::string first = input[0].first;
        std::string start = fresh(first[0], 0);
        std::vector<Rule> rules = {{start, {first}}};  // START
        rules.insert(rules.end(), input.begin(), input.end());

        // DEL: find the nullable variables, then copy rules with some of them left out.
        std::set<std::string> nullable;
        for (bool changed = true; changed;) {
            changed = false;
            for (auto& [h, b] : rules)
                if (!nullable.count(h) &&
                    std::all_of(b.begin(), b.end(), [&](auto& s) { return nullable.count(s) > 0; }))
                    changed = nullable.insert(h).second;
        }
        if (!nullable.empty()) {
            for (size_t i = 0; i < rules.size(); i++) {
                Rule r = rules[i];
                std::vector<size_t> at;
                for (size_t k = 0; k < r.second.size(); k++)
                    if (nullable.count(r.second[k])) at.push_back(k);
                size_t added = 0;
                for (size_t mask = 1; mask < (size_t{1} << at.size()); mask++) {
                    Body body;
                    for (size_t k = 0; k < r.second.size(); k++) {
                        auto j = std::find(at.begin(), at.end(), k) - at.begin();
                        if (j == static_cast<long>(at.size()) || !(mask >> j & 1)) body.push_back(r.second[k]);
                    }
                    Rule v = {r.first, body};
                    if (!body.empty() && body != Body{r.first} && !has(rules, v))
                        rules.insert(rules.begin() + static_cast<long>(i + ++added), v);
                }
                i += added;
            }
            rules.erase(std::remove_if(rules.begin(), rules.end(),
                                       [](auto& r) { return r.second.empty() || r.second == Body{r.first}; }),
                        rules.end());
            if (nullable.count(start)) rules.push_back({start, {}});
        }

        // UNIT: each variable takes the other rules of every variable it becomes.
        if (std::any_of(rules.begin(), rules.end(), [](auto& r) { return isUnit(r.second); })) {
            std::vector<std::string> heads;
            for (auto& [h, b] : rules)
                if (std::find(heads.begin(), heads.end(), h) == heads.end()) heads.push_back(h);
            std::vector<Rule> next;
            for (auto& a : heads) {
                std::vector<std::string> reach = {a};
                for (size_t k = 0; k < reach.size(); k++)
                    for (auto& [h, b] : rules)
                        if (h == reach[k] && isUnit(b) && std::find(reach.begin(), reach.end(), b[0]) == reach.end())
                            reach.push_back(b[0]);
                for (auto& x : reach)
                    for (auto& [h, b] : rules)
                        if (h == x && !isUnit(b) && !has(next, {a, b})) next.push_back({a, b});
            }
            rules = next;
        }
        return termFirst ? split(term(rules)) : term(split(rules));
    }
};
