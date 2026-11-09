#pragma once
#include <map>
#include <set>
#include <string>
#include <utility>

// A Turing machine with states A, B, C, ..., a halt state H, and a tape of 0s and 1s.
//
// Rules come in the compact form "1RB1LB_1LA1RH": six characters per state, the rule for
// reading 0 and then the rule for reading 1. "1RB" writes 1, moves right and goes to B; "---"
// is no rule, which stops the machine without a move. The tape starts as all 0s, infinite both
// ways, and the machine starts in A.
class BusyBeaver {
  public:
    explicit BusyBeaver(const std::string& text) {
        char q = 'A';
        for (std::size_t at = 0; at < text.size(); at += 7, q++) {
            for (int bit = 0; bit < 2; bit++) {
                std::string r = text.substr(at + 3 * bit, 3);
                if (r != "---") rules_[{q, bit}] = Rule{r[0] - '0', r[1], r[2]};
            }
        }
        reset();
    }

    void reset() {
        ones_.clear();
        head_ = 0;
        state_ = 'A';
        moves_ = 0;
    }

    // Makes one move. Returns false once the machine has halted.
    bool step() {
        if (state_ == 'H') return false;
        int read = ones_.count(head_) ? 1 : 0;
        auto it = rules_.find({state_, read});
        if (it == rules_.end()) {  // no rule: stop without a move
            state_ = 'H';
            return false;
        }
        const Rule& r = it->second;
        if (r.write) ones_.insert(head_);
        else ones_.erase(head_);
        head_ += r.move == 'R' ? 1 : -1;
        state_ = r.next;
        moves_++;
        return true;
    }

    // Makes up to `tries` moves, stopping early if the machine halts.
    void run(long tries) {
        for (long i = 0; i < tries; i++)
            if (!step()) break;
    }

    char state() const { return state_; }
    long moves() const { return moves_; }
    std::size_t ones() const { return ones_.size(); }

  private:
    struct Rule {
        int write;
        char move;
        char next;
    };
    std::map<std::pair<char, int>, Rule> rules_;
    std::set<long> ones_;  // the cells that hold 1
    long head_ = 0;
    char state_ = 'A';
    long moves_ = 0;
};
