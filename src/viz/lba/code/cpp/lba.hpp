// A linear-bounded automaton: a Turing machine confined to its input between < and >. The head
// may read the markers but never overwrite them or move past them.
#pragma once
#include <map>
#include <sstream>
#include <string>
#include <tuple>
#include <utility>

struct Lba {
    // (state, read) -> (next state, write, move L or R)
    std::map<std::pair<std::string, char>, std::tuple<std::string, char, char>> rules;
    std::string start;

    // Rules written "q0 a q1 x R; ...": state, read, next state, write, move.
    Lba(std::string start, const std::string& text) : start(std::move(start)) {
        std::stringstream items(text);
        for (std::string item; std::getline(items, item, ';');) {
            std::istringstream in(item);
            std::string q, p;
            char a, b, d;
            in >> q >> a >> p >> b >> d;
            rules[{q, a}] = {p, b, d};
        }
    }

    // Returns "accept", "reject" or "blocked", then the moves made.
    std::string run(const std::string& word, int cap) const {
        std::string tape = "<" + word + ">", q = start;
        size_t head = 1;
        int moves = 0;
        while (moves < cap) {
            char a = tape[head];
            auto r = rules.find({q, a});
            if (r == rules.end()) return "reject " + std::to_string(moves);
            auto [p, b, d] = r->second;
            bool marker = a == '<' || a == '>';
            if ((a == '<' && d == 'L') || (a == '>' && d == 'R') || (marker && b != a))
                return "blocked " + std::to_string(moves);  // the head may not leave the input
            tape[head] = b;
            head = d == 'R' ? head + 1 : head - 1;
            q = p;
            moves++;
            if (q == "accept" || q == "reject") return q + " " + std::to_string(moves);
        }
        return "reject " + std::to_string(moves);
    }
};

// a^n b^n c^n: cross off one a, b and c per pass, then check only y's and z's are left.
inline const Lba ANBNCN("q0",
    "q0 a q1 x R; q0 y q4 y R; q0 > accept > L; q1 a q1 a R; q1 y q1 y R; q1 b q2 y R;"
    "q2 b q2 b R; q2 z q2 z R; q2 c q3 z L; q3 a q3 a L; q3 b q3 b L; q3 y q3 y L;"
    "q3 z q3 z L; q3 x q0 x R; q4 y q4 y R; q4 z q5 z R; q5 z q5 z R; q5 > accept > L");
// a^(2^k): cross off every other a on each pass (Sipser's M2), inside the markers.
inline const Lba POWER2("q1",
    "q1 a q2 y R; q2 x q2 x R; q2 a q3 x R; q2 > accept > L; q3 x q3 x R; q3 a q4 a R;"
    "q3 > q5 > L; q4 x q4 x R; q4 a q3 x R; q5 a q5 a L; q5 x q5 x L; q5 y q2 y R");
// Doubling: wants to write a copy after the input, so it runs into the right marker.
inline const Lba DOUBLE("q0", "q0 a q1 x R; q0 > accept > L; q1 a q1 a R; q1 x q1 x R; q1 > q1 > R");
