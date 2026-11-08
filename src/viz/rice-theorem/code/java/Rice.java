import java.util.*;
import java.util.function.Function;

/**
 * Rice's theorem by reduction from HALT, on toy programs that read their input and never write.
 * A toy program is a string of instructions: A accept, R reject, > right, < left, Gk goto k,
 * Ek goto k if the head is past the input, ?ck goto k if the head is on c. Running past the last
 * line rejects. Such a program halts or repeats a (line, head) pair, so run() always answers;
 * for real Turing machines no program can.
 */
public class Rice {
    static List<String> parse(String code) {
        List<String> prog = new ArrayList<>();
        for (int k = 0; k < code.length(); ) {
            char c = code.charAt(k);
            int n = "AR<>".indexOf(c) >= 0 ? 1 : (c == 'G' || c == 'E') ? 2 : 3;
            prog.add(code.substring(k, k + n));
            k += n;
        }
        return prog;
    }

    /** Returns "accept", "reject" or "loop". */
    public static String run(String code, String x) {
        List<String> prog = parse(code);
        Set<String> seen = new HashSet<>();
        int line = 1, head = 0;
        while (line <= prog.size()) {
            if (!seen.add(line + "," + head)) return "loop";
            String ins = prog.get(line - 1);
            switch (ins.charAt(0)) {
                case 'A' -> { return "accept"; }
                case 'R' -> { return "reject"; }
                case '>' -> { head = Math.min(x.length(), head + 1); line++; }
                case '<' -> { head = Math.max(0, head - 1); line++; }
                case 'G' -> line = ins.charAt(1) - '0';
                case 'E' -> line = head == x.length() ? ins.charAt(1) - '0' : line + 1;
                default -> line = head < x.length() && x.charAt(head) == ins.charAt(1) ? ins.charAt(2) - '0' : line + 1;
            }
        }
        return "reject";
    }

    /** The program of the proof: on input x, run m on w; if that halts, behave like mP on x. */
    public static Function<String, String> mPrime(String m, String w, String mP) {
        return x -> run(m, w).equals("loop") ? "loop" : run(mP, x);
    }

    /** P = "accepts testWord", decided here by running (possible only for toy programs). */
    public static boolean hasProperty(Function<String, String> machine, String testWord) {
        return machine.apply(testWord).equals("accept");
    }
}
