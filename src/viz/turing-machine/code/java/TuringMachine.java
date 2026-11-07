import java.util.HashMap;
import java.util.Map;

/**
 * A one-tape Turing machine, as in Sipser.
 *
 * <p>Rules look like "q0 1 -> q1 0 R" (in q0 reading 1: write 0, move right, go to q1), or
 * "q1 0,y -> q1 R" to leave the symbol as it is, separated by semicolons. "start q0" names the
 * start state; otherwise it is the first rule's state. The states accept and reject halt, and
 * a missing rule rejects. The tape starts at cell 0: a move left from there leaves the head
 * where it is.
 */
public class TuringMachine {
    public static final char BLANK = '_';

    private record Rule(String next, char write, char move) {}

    /** verdict is "accept", "reject" or "running" (stopped after maxMoves). */
    public record Result(String verdict, int moves, String tape) {}

    private final Map<String, Rule> delta = new HashMap<>(); // "state symbol" -> rule
    private String start;

    public TuringMachine(String text) {
        for (String item : text.split(";")) {
            String[] w = item.trim().split("\\s+"); // state symbols -> next [write] move
            if (w[0].isEmpty()) continue;
            if (w[0].equals("start")) {
                start = w[1];
                continue;
            }
            for (String a : w[1].split(",")) {
                char write = w.length == 6 ? w[4].charAt(0) : a.charAt(0); // short form keeps it
                delta.put(w[0] + " " + a, new Rule(w[3], write, w[w.length - 1].charAt(0)));
            }
            if (start == null) start = w[0];
        }
    }

    public Result run(String word, int maxMoves) {
        Map<Integer, Character> tape = new HashMap<>();
        for (int i = 0; i < word.length(); i++) tape.put(i, word.charAt(i));
        String state = start;
        int head = 0;
        int moves = 0;
        while (!state.equals("accept") && !state.equals("reject")) {
            Rule r = delta.get(state + " " + tape.getOrDefault(head, BLANK));
            if (r == null) {
                state = "reject";
                break;
            }
            if (moves == maxMoves) return new Result("running", moves, tapeText(tape));
            tape.put(head, r.write());
            if (r.move() == 'R') head++;
            else if (r.move() == 'L') head = Math.max(0, head - 1);
            state = r.next();
            moves++;
        }
        return new Result(state, moves, tapeText(tape));
    }

    /** The tape from its first to its last non-blank cell, or _ if it is blank. */
    static String tapeText(Map<Integer, Character> tape) {
        int lo = Integer.MAX_VALUE;
        int hi = Integer.MIN_VALUE;
        for (var cell : tape.entrySet()) {
            if (cell.getValue() == BLANK) continue;
            lo = Math.min(lo, cell.getKey());
            hi = Math.max(hi, cell.getKey());
        }
        if (lo > hi) return String.valueOf(BLANK);
        StringBuilder out = new StringBuilder();
        for (int i = lo; i <= hi; i++) out.append(tape.getOrDefault(i, BLANK));
        return out.toString();
    }
}
