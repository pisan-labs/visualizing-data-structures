import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * A Turing machine with states A, B, C, ..., a halt state H, and a tape of 0s and 1s.
 *
 * <p>Rules come in the compact form "1RB1LB_1LA1RH": six characters per state, the rule for
 * reading 0 and then the rule for reading 1. "1RB" writes 1, moves right and goes to B; "---" is
 * no rule, which stops the machine without a move. The tape starts as all 0s, infinite both
 * ways, and the machine starts in A.
 */
public class BusyBeaver {
    private record Rule(int write, char move, char next) {}

    private final Map<String, Rule> rules = new HashMap<>(); // "A0" -> rule
    private final Set<Long> ones = new HashSet<>(); // the cells that hold 1
    private long head;
    private char state;
    private long moves;

    public BusyBeaver(String text) {
        String[] parts = text.split("_");
        for (int i = 0; i < parts.length; i++) {
            char q = (char) ('A' + i);
            for (int bit = 0; bit < 2; bit++) {
                String r = parts[i].substring(3 * bit, 3 * bit + 3);
                if (!r.equals("---")) rules.put("" + q + bit, new Rule(r.charAt(0) - '0', r.charAt(1), r.charAt(2)));
            }
        }
        reset();
    }

    public void reset() {
        ones.clear();
        head = 0;
        state = 'A';
        moves = 0;
    }

    /** Makes one move. Returns false once the machine has halted. */
    public boolean step() {
        if (state == 'H') return false;
        int read = ones.contains(head) ? 1 : 0;
        Rule rule = rules.get("" + state + read);
        if (rule == null) { // no rule: stop without a move
            state = 'H';
            return false;
        }
        if (rule.write() == 1) ones.add(head);
        else ones.remove(head);
        head += rule.move() == 'R' ? 1 : -1;
        state = rule.next();
        moves++;
        return true;
    }

    /** Makes up to `tries` moves, stopping early if the machine halts. */
    public void run(long tries) {
        for (long i = 0; i < tries; i++) if (!step()) break;
    }

    public char state() { return state; }

    public long moves() { return moves; }

    public int ones() { return ones.size(); }
}
