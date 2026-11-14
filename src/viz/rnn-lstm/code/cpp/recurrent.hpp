#pragma once
#include <array>
#include <cmath>
#include <string>
#include <vector>

// Reads one word vector at a time with one memory unit that means "an animal".
// A word is four numbers: how much it is an animal, a thing, an action and a
// small word. model is "rnn", "lstm" or "lstm97" (the 1997 cell, with no
// forget gate). pull is d(memory now) / d(memory after word 1): a product of
// one factor per step.
using Vec = std::array<double, 4>;

struct Gate {
    Vec u;     // a weight per feature
    double w;  // the weight on h
    double b;  // the bias
};

// Hand-made weights. The plain RNN: only an animal writes to the memory.
const Vec U = {1, 0, 0, 0};
const Gate F = {{-6, 0, 0, 0}, 0, 3};  // an animal shuts the forget gate
const Gate I = {{6, 0, 0, 0}, 0, -3};  // ... and opens the input gate
const Gate G = {{2, 0, 0, 0}, 0, 0};   // the candidate: "an animal"
const Gate O = {{0, 0, 4, 0}, 0, -2};  // a verb opens the output gate

inline double dot(const Vec& x, const Vec& u) {
    double s = 0;
    for (std::size_t t = 0; t < x.size(); t++) s += x[t] * u[t];
    return s;
}

inline double sigmoid(double z) { return 1 / (1 + std::exp(-z)); }

inline double sum(const Gate& g, const Vec& x, double h) { return dot(x, g.u) + h * g.w + g.b; }

struct Recurrent {
    std::string model;
    double w;
    double h = 0, c = 0, pull = 0;
    bool first = true;

    Recurrent(std::string m, double weight) : model(std::move(m)), w(weight) {}

    std::vector<double> read(const Vec& x) {
        double factor;
        std::vector<double> out;
        if (model == "rnn") {
            h = std::tanh(w * h + dot(x, U));
            factor = w * (1 - h * h);  // the slope of this step
            out = {h};
        } else {
            double f = model == "lstm" ? sigmoid(sum(F, x, h)) : 1.0;
            double i = sigmoid(sum(I, x, h));
            double g = std::tanh(sum(G, x, h));
            double o = sigmoid(sum(O, x, h));
            c = f * c + i * g;  // keep some of the old, add some new
            h = o * std::tanh(c);
            factor = f;  // the cell's path back is only the forget gate
            out = {f, i, g, c, o, h};
        }
        pull = first ? 1.0 : pull * factor;
        first = false;
        out.push_back(pull);
        return out;
    }
};
