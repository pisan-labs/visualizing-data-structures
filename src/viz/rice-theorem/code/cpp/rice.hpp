// Rice's theorem by reduction from HALT, on toy programs that read their input and never write.
// A toy program is a string of instructions: A accept, R reject, > right, < left, Gk goto k,
// Ek goto k if the head is past the input, ?ck goto k if the head is on c. Running past the last
// line rejects. Such a program halts or repeats a (line, head) pair, so run() always answers;
// for real Turing machines no program can.
#pragma once
#include <algorithm>
#include <functional>
#include <set>
#include <string>
#include <utility>
#include <vector>

inline std::vector<std::string> parse(const std::string& code) {
    std::vector<std::string> prog;
    for (size_t k = 0; k < code.size();) {
        char c = code[k];
        size_t n = std::string("AR<>").find(c) != std::string::npos ? 1 : (c == 'G' || c == 'E') ? 2 : 3;
        prog.push_back(code.substr(k, n));
        k += n;
    }
    return prog;
}

// Returns "accept", "reject" or "loop".
inline std::string run(const std::string& code, const std::string& x) {
    auto prog = parse(code);
    std::set<std::pair<size_t, size_t>> seen;
    size_t line = 1, head = 0;
    while (line <= prog.size()) {
        if (!seen.insert({line, head}).second) return "loop";
        const std::string& ins = prog[line - 1];
        switch (ins[0]) {
            case 'A': return "accept";
            case 'R': return "reject";
            case '>': head = std::min(x.size(), head + 1); line++; break;
            case '<': head = head > 0 ? head - 1 : 0; line++; break;
            case 'G': line = ins[1] - '0'; break;
            case 'E': line = head == x.size() ? ins[1] - '0' : line + 1; break;
            default: line = head < x.size() && x[head] == ins[1] ? ins[2] - '0' : line + 1;
        }
    }
    return "reject";
}

// The program of the proof: on input x, run m on w; if that halts, behave like mP on x.
inline std::function<std::string(const std::string&)> mPrime(std::string m, std::string w, std::string mP) {
    return [=](const std::string& x) { return run(m, w) == "loop" ? std::string("loop") : run(mP, x); };
}

// P = "accepts testWord", decided here by running (possible only for toy programs).
inline bool hasProperty(const std::function<std::string(const std::string&)>& machine, const std::string& testWord) {
    return machine(testWord) == "accept";
}
