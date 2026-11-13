// Test driver: reads one operation per line, prints one line per result.
// "settings slots policy" starts an empty server and "add name arrival prompt length" adds a
// request; neither prints. "step" runs one iteration and prints "t: <who is in each slot, - when
// idle> | <who returned, - for no one>"; "run" runs until every request is done and prints the
// lines of all those iterations joined by " / ".
#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>

#include "scheduler.hpp"

static std::string line(const Scheduler& s, const Iteration& it) {
    std::string out = std::to_string(s.clock - 1) + ":";
    for (const Req& r : it.ran) out += " " + (r ? r->name : std::string("-"));
    std::vector<std::string> back;
    for (const Req& r : it.returned) back.push_back(r->name);
    std::sort(back.begin(), back.end());
    out += " |";
    for (const std::string& b : back) out += " " + b;
    if (back.empty()) out += " -";
    return out;
}

int main() {
    std::unique_ptr<Scheduler> s;
    std::string text;
    while (std::getline(std::cin, text)) {
        std::istringstream in(text);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "settings") {
            int slots;
            std::string policy;
            in >> slots >> policy;
            s = std::make_unique<Scheduler>(slots, policy);
        } else if (op == "add") {
            auto r = std::make_shared<Request>();
            in >> r->name >> r->arrive >> r->prompt >> r->length;
            s->add(r);
        } else if (op == "step") {
            Iteration it = s->step();
            std::cout << line(*s, it) << "\n";
        } else if (op == "run") {
            std::string lines;
            while (s->busy()) {
                Iteration it = s->step();
                lines += (lines.empty() ? "" : " / ") + line(*s, it);
            }
            std::cout << lines << "\n";
        }
    }
}
