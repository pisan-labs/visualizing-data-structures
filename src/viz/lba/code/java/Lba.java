import java.util.*;

/**
 * A linear-bounded automaton: a Turing machine confined to its input between < and >. The head
 * may read the markers but never overwrite them or move past them.
 */
public class Lba {
    /** What a rule does: go to state `to`, write `write`, move L or R. */
    record Action(String to, char write, char move) {}

    final Map<String, Action> rules = new HashMap<>();
    final String start;

    /** Rules written "q0 a q1 x R; ...": state, read, next state, write, move. */
    public Lba(String start, String text) {
        this.start = start;
        for (String item : text.split(";")) {
            String[] p = item.trim().split("\\s+");
            rules.put(p[0] + " " + p[1], new Action(p[2], p[3].charAt(0), p[4].charAt(0)));
        }
    }

    // a^n b^n c^n: cross off one a, b and c per pass, then check only y's and z's are left.
    public static final Lba ANBNCN = new Lba("q0",
        "q0 a q1 x R; q0 y q4 y R; q0 > accept > L; q1 a q1 a R; q1 y q1 y R; q1 b q2 y R;"
        + "q2 b q2 b R; q2 z q2 z R; q2 c q3 z L; q3 a q3 a L; q3 b q3 b L; q3 y q3 y L;"
        + "q3 z q3 z L; q3 x q0 x R; q4 y q4 y R; q4 z q5 z R; q5 z q5 z R; q5 > accept > L");
    // a^(2^k): cross off every other a on each pass (Sipser's M2), inside the markers.
    public static final Lba POWER2 = new Lba("q1",
        "q1 a q2 y R; q2 x q2 x R; q2 a q3 x R; q2 > accept > L; q3 x q3 x R; q3 a q4 a R;"
        + "q3 > q5 > L; q4 x q4 x R; q4 a q3 x R; q5 a q5 a L; q5 x q5 x L; q5 y q2 y R");
    // Doubling: wants to write a copy after the input, so it runs into the right marker.
    public static final Lba DOUBLE = new Lba("q0",
        "q0 a q1 x R; q0 > accept > L; q1 a q1 a R; q1 x q1 x R; q1 > q1 > R");

    /** Returns "accept", "reject" or "blocked", then the moves made. */
    public String run(String word, int cap) {
        char[] tape = ("<" + word + ">").toCharArray();
        int head = 1, moves = 0;
        String q = start;
        while (moves < cap) {
            char a = tape[head];
            Action r = rules.get(q + " " + a);
            if (r == null) return "reject " + moves;
            boolean marker = a == '<' || a == '>';
            if ((a == '<' && r.move() == 'L') || (a == '>' && r.move() == 'R') || (marker && r.write() != a))
                return "blocked " + moves; // the head may not leave the input
            tape[head] = r.write();
            head += r.move() == 'R' ? 1 : -1;
            q = r.to();
            moves++;
            if (q.equals("accept") || q.equals("reject")) return q + " " + moves;
        }
        return "reject " + moves;
    }
}
