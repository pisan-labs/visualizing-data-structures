#pragma once
#include <algorithm>
#include <memory>
#include <string>
#include <vector>

struct Request {
    std::string name;
    int arrive, prompt, length;
    int start = -1;  // the iteration it got a slot
    int made = 0;    // tokens written so far
    int done = -1;   // the time its answer is returned
};

using Req = std::shared_ptr<Request>;

// What one iteration did: who was in each slot (null when idle) and who returned.
struct Iteration {
    std::vector<Req> ran, returned;
};

// A batch of `slots` requests, run one iteration at a time. "continuous" fills a free slot at
// every iteration (Orca's iteration-level scheduling); "static" starts a batch only when every
// slot is free, and returns it when its longest request is done.
class Scheduler {
public:
    Scheduler(int slots, const std::string& policy)
        : slots_(slots), continuous_(policy == "continuous") {}

    void add(Req r) { requests_.push_back(r); }

    // Arrived and not started, first come first served (ties in the order added).
    std::vector<Req> waiting() const {
        std::vector<Req> line;
        for (const Req& r : requests_)
            if (r->start < 0 && r->arrive <= clock) line.push_back(r);
        std::stable_sort(line.begin(), line.end(),
                         [](const Req& a, const Req& b) { return a->arrive < b->arrive; });
        return line;
    }

    Iteration step() {
        int t = clock;
        std::vector<Req> line = waiting();
        size_t next = 0;
        if (continuous_ || batch_.empty()) {
            for (Req& slot : slots_) {
                if (!slot && next < line.size()) {
                    slot = line[next++];
                    slot->start = t;
                    if (!continuous_) batch_.push_back(slot);
                }
            }
        }
        Iteration it{slots_, {}};
        for (Req& slot : slots_) {
            if (!slot) continue;
            slot->made++;  // the first iteration reads the prompt and writes a token
            if (slot->made == slot->length) {
                if (continuous_) {
                    slot->done = t + 1;
                    it.returned.push_back(slot);
                }
                slot = nullptr;
            }
        }
        bool all_done = std::all_of(batch_.begin(), batch_.end(),
                                    [](const Req& r) { return r->made == r->length; });
        if (!batch_.empty() && all_done) {
            for (Req& r : batch_) r->done = t + 1;
            it.returned = batch_;
            batch_.clear();
        }
        clock++;
        return it;
    }

    bool busy() const {
        return std::any_of(requests_.begin(), requests_.end(),
                           [](const Req& r) { return r->done < 0; });
    }

    int clock = 0;

private:
    std::vector<Req> slots_;
    bool continuous_;
    std::vector<Req> batch_;  // static: the requests of the running batch
    std::vector<Req> requests_;
};
