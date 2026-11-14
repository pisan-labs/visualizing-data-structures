#pragma once
#include <algorithm>
#include <deque>

// Four ways to let at most limit requests through per window seconds; t is in whole seconds.
struct Limiter {
    virtual ~Limiter() = default;
    virtual bool allow(int t) = 0;
};

// At most limit requests in each window [k * window, (k + 1) * window).
class FixedWindow : public Limiter {
    int limit, window, start = 0, count = 0;

  public:
    FixedWindow(int limit, int window) : limit(limit), window(window) {}

    bool allow(int t) override {
        if (t >= start + window) {
            start = t / window * window;
            count = 0;
        }
        if (count < limit) {
            ++count;
            return true;
        }
        return false;
    }
};

// The times of the requests let through in the last window seconds, oldest first.
class SlidingLog : public Limiter {
    int limit, window;
    std::deque<int> log;

  public:
    SlidingLog(int limit, int window) : limit(limit), window(window) {}

    bool allow(int t) override {
        while (!log.empty() && log.front() <= t - window) log.pop_front();
        if (static_cast<int>(log.size()) < limit) {
            log.push_back(t);
            return true;
        }
        return false;
    }
};

// This window's count and the previous one's. The last window seconds hold about
// curr + prev * (window - (t - start)) / window requests.
class SlidingWindowCounter : public Limiter {
    int limit, window, start = 0, prev = 0, curr = 0;

  public:
    SlidingWindowCounter(int limit, int window) : limit(limit), window(window) {}

    bool allow(int t) override {
        int w = t / window * window;
        if (w == start + window) {
            prev = curr;
            curr = 0;
        } else if (w > start + window) {
            prev = 0;
            curr = 0;
        }
        start = w;
        int overlap = window - (t - start);
        // estimate < limit, times window, so the arithmetic stays in whole numbers
        if (curr * window + prev * overlap < limit * window) {
            ++curr;
            return true;
        }
        return false;
    }
};

// At most limit tokens, and limit more every window seconds. Tokens are kept in units of
// 1 / window (a token is window units), so the arithmetic is exact.
class TokenBucket : public Limiter {
    int limit, window, units, last = 0;

  public:
    TokenBucket(int limit, int window) : limit(limit), window(window), units(limit * window) {}

    bool allow(int t) override {
        units = std::min(limit * window, units + (t - last) * limit);
        last = t;
        if (units >= window) {
            units -= window;
            return true;
        }
        return false;
    }
};
