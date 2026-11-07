import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A Turing machine with k tapes (Sipser 3.13), and its simulation on one tape.
 *
 * <p>addRule("copy", "0_", "copy", "00", "RR"): in state copy, with tape 1 reading 0 and tape 2
 * a blank, write 0 on both tapes and move both heads right. One character per tape; a move is
 * L, R or S (stay). The states accept and reject halt, and a missing rule rejects. Every tape
 * starts at cell 0: a head told to move left there stays put.
 */
public class MultiTapeTM {
    public static final char BLANK = '_';

    private record Rule(String next, String writes, String moves) {}

    /** verdict is "accept", "reject" or "running" (stopped at the cap). */
    public record Result(String verdict, int moves, List<StringBuilder> tapes) {}

    /** steps counts the single tape's head moves; marks[i] is the cell under head i. */
    public record SimResult(String verdict, int moves, int steps, String tape, int[] marks) {}

    private final int k;
    private final String start;
    private final Map<String, Rule> delta = new HashMap<>(); // "state reads" -> rule

    public MultiTapeTM(int k, String start) {
        this.k = k;
        this.start = start;
    }

    public void addRule(String state, String reads, String next, String writes, String moves) {
        delta.put(state + " " + reads, new Rule(next, writes, moves));
    }

    private static boolean halted(String state) {
        return state.equals("accept") || state.equals("reject");
    }

    /** Run on one word per tape. */
    public Result run(String[] words, int maxMoves) {
        List<StringBuilder> tapes = new ArrayList<>();
        for (int i = 0; i < k; i++) tapes.add(new StringBuilder(i < words.length ? words[i] : ""));
        int[] heads = new int[k];
        String state = start;
        int moves = 0;
        while (!halted(state)) {
            StringBuilder reads = new StringBuilder();
            for (int i = 0; i < k; i++) {
                StringBuilder t = tapes.get(i);
                reads.append(heads[i] < t.length() ? t.charAt(heads[i]) : BLANK);
            }
            Rule rule = delta.get(state + " " + reads);
            if (rule == null) {
                state = "reject";
                break;
            }
            if (moves == maxMoves) return new Result("running", moves, tapes);
            for (int i = 0; i < k; i++) { // every head at once
                StringBuilder t = tapes.get(i);
                while (t.length() <= heads[i]) t.append(BLANK);
                t.setCharAt(heads[i], rule.writes().charAt(i));
                switch (rule.moves().charAt(i)) {
                    case 'R' -> heads[i]++;
                    case 'L' -> heads[i] = Math.max(0, heads[i] - 1);
                    default -> {}
                }
            }
            state = rule.next();
            moves++;
        }
        return new Result(state, moves, tapes);
    }

    /** Sipser's simulation on one tape: # w1 # w2 # ... #, with a mark on each head's cell. */
    public SimResult simulate(String[] words, int maxMoves) {
        StringBuilder tape = new StringBuilder("#");
        int[] marks = new int[k];
        for (int i = 0; i < k; i++) {
            String w = i < words.length ? words[i] : "";
            marks[i] = tape.length();
            tape.append(w.isEmpty() ? String.valueOf(BLANK) : w).append('#');
        }
        int steps = 2 * (tape.length() - 1); // one pass right to write it, one pass back
        String state = start;
        int moves = 0;
        while (!halted(state)) {
            StringBuilder reads = new StringBuilder(); // scan right to the last #
            for (int m : marks) reads.append(tape.charAt(m));
            Rule rule = delta.get(state + " " + reads);
            if (rule == null) {
                steps += tape.length() - 1;
                state = "reject";
                break;
            }
            if (moves == maxMoves) return new SimResult("running", moves, steps, tape.toString(), marks);
            steps += tape.length() - 1;
            int head = tape.length() - 1;
            for (int i = k - 1; i >= 0; i--) { // scan back, updating each mark
                int m = marks[i];
                steps += head - m;
                head = m;
                tape.setCharAt(m, rule.writes().charAt(i));
                char d = rule.moves().charAt(i);
                if (d == 'L' && tape.charAt(m - 1) != '#') {
                    marks[i] = head = m - 1;
                    steps++;
                } else if (d == 'R') {
                    marks[i] = head = m + 1;
                    steps++;
                    if (tape.charAt(m + 1) == '#') { // a new cell: shift the rest right, walk back
                        steps += 2 * (tape.length() - m - 1);
                        tape.insert(m + 1, BLANK);
                        for (int j = i + 1; j < k; j++) marks[j]++;
                    }
                }
            }
            steps += head; // back to the first #
            state = rule.next();
            moves++;
        }
        return new SimResult(state, moves, steps, tape.toString(), marks);
    }
}
