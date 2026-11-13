// Test driver: reads one operation per line, prints one result per line.
// "clear" starts an expression, "var name value" adds a variable and
// "op name kind operands [power]" a node (operands are names or numbers).
// "forward" prints f. "backward" builds the graph afresh from the variables, runs the
// backward pass and prints f and each variable's gradient; the variables keep their
// gradients until "zero".
#include <cctype>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "value.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

struct Step {
    std::string name, kind;
    std::vector<std::string> args;
};

static Value build(const std::map<std::string, Value>& leaves, const std::vector<Step>& recipe) {
    std::map<std::string, Value> vals = leaves;
    auto get = [&](const std::string& t) {
        return std::isalpha(static_cast<unsigned char>(t[0])) ? vals.at(t) : make(std::stod(t));
    };
    Value out;
    for (const Step& s : recipe) {
        Value x = get(s.args[0]);
        if (s.kind == "add") out = x + get(s.args[1]);
        else if (s.kind == "sub") out = x - get(s.args[1]);
        else if (s.kind == "mul") out = x * get(s.args[1]);
        else if (s.kind == "div") out = x / get(s.args[1]);
        else if (s.kind == "neg") out = -x;
        else if (s.kind == "pow") out = pow(x, std::stoi(s.args[1]));
        else if (s.kind == "tanh") out = tanh(x);
        else if (s.kind == "relu") out = relu(x);
        else if (s.kind == "exp") out = exp(x);
        else out = sigmoid(x);
        vals[s.name] = out;
    }
    return out;
}

int main() {
    std::vector<std::string> names;
    std::map<std::string, Value> leaves;
    std::vector<Step> recipe;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "clear") {
            names.clear();
            leaves.clear();
            recipe.clear();
        } else if (op == "var") {
            std::string name;
            double v;
            in >> name >> v;
            names.push_back(name);
            leaves[name] = make(v);
        } else if (op == "op") {
            Step s;
            in >> s.name >> s.kind;
            for (std::string t; in >> t;) s.args.push_back(t);
            recipe.push_back(s);
        } else if (op == "zero") {
            for (auto& kv : leaves) kv.second->grad = 0;
        } else if (op == "forward") {
            std::cout << "f " << three(build(leaves, recipe)->data) << "\n";
        } else if (op == "backward") {
            Value f = build(leaves, recipe);
            backward(f);
            std::cout << "f " << three(f->data) << " |";
            for (const std::string& n : names) std::cout << " " << n << " " << three(leaves[n]->grad);
            std::cout << "\n";
        }
    }
}
