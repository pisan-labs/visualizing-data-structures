#pragma once
#include <cmath>
#include <functional>
#include <memory>
#include <set>
#include <vector>

// A number that remembers how it was made, so gradients can flow back.
struct Node {
    double data = 0, grad = 0;
    std::vector<std::shared_ptr<Node>> inputs;
    std::function<void()> backward = [] {};  // passes grad on to the inputs
};
using Value = std::shared_ptr<Node>;

inline Value make(double data, std::vector<Value> inputs = {}) {
    Value v = std::make_shared<Node>();
    v->data = data;
    v->inputs = std::move(inputs);
    return v;
}

// x to a whole power k, by repeated multiplication.
inline double power(double x, int k) {
    double p = 1;
    for (int i = 0; i < k; i++) p *= x;
    return p;
}

inline Value operator+(const Value& a, const Value& b) {
    Value out = make(a->data + b->data, {a, b});
    Node* o = out.get();
    out->backward = [a, b, o] {
        a->grad += o->grad;
        b->grad += o->grad;
    };
    return out;
}

inline Value operator-(const Value& a, const Value& b) {
    Value out = make(a->data - b->data, {a, b});
    Node* o = out.get();
    out->backward = [a, b, o] {
        a->grad += o->grad;
        b->grad += -o->grad;
    };
    return out;
}

inline Value operator*(const Value& a, const Value& b) {
    Value out = make(a->data * b->data, {a, b});
    Node* o = out.get();
    out->backward = [a, b, o] {
        a->grad += b->data * o->grad;
        b->grad += a->data * o->grad;
    };
    return out;
}

inline Value operator/(const Value& a, const Value& b) {
    Value out = make(a->data / b->data, {a, b});
    Node* o = out.get();
    out->backward = [a, b, o] {
        a->grad += (1 / b->data) * o->grad;
        b->grad += (-a->data / (b->data * b->data)) * o->grad;
    };
    return out;
}

// A function of one value; local(out) is its derivative.
inline Value unary(const Value& a, double result, std::function<double(double)> local) {
    Value out = make(result, {a});
    Node* o = out.get();
    out->backward = [a, o, local] { a->grad += local(o->data) * o->grad; };
    return out;
}

inline Value operator-(const Value& a) {
    return unary(a, -a->data, [](double) { return -1.0; });
}

inline Value pow(const Value& a, int k) {
    return unary(a, power(a->data, k), [a, k](double) { return k * power(a->data, k - 1); });
}

inline Value tanh(const Value& a) {
    return unary(a, std::tanh(a->data), [](double t) { return 1 - t * t; });
}

inline Value relu(const Value& a) {
    double x = a->data;
    return unary(a, x > 0 ? x : 0, [x](double) { return x > 0 ? 1.0 : 0.0; });
}

inline Value exp(const Value& a) {
    return unary(a, std::exp(a->data), [](double e) { return e; });
}

inline Value sigmoid(const Value& a) {
    return unary(a, 1 / (1 + std::exp(-a->data)), [](double s) { return s * (1 - s); });
}

// Fill in d(f)/d(v) for every value v that f was made from.
inline void backward(const Value& f) {
    std::vector<Node*> order;
    std::set<Node*> seen;
    std::function<void(Node*)> build = [&](Node* v) {  // v goes in after everything it reads
        if (!seen.insert(v).second) return;
        for (const Value& u : v->inputs) build(u.get());
        order.push_back(v);
    };
    build(f.get());
    f->grad = 1;
    for (auto it = order.rbegin(); it != order.rend(); ++it) (*it)->backward();
}
