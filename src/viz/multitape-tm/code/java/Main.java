import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. "machine k start"
 * starts a machine and "rule state reads next writes moves" adds a rule (neither prints);
 * "run words" prints "accept after 16 moves: 0110=0110 | $0110"; "simulate words" prints
 * "accept after 10 moves of M and 248 on one tape: #01=01[_]#$01[_]#".
 */
public class Main {
    static String verdict(String v) {
        return v.equals("running") ? "still running" : v;
    }

    static String plural(int n) {
        return n + (n == 1 ? " move" : " moves");
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        MultiTapeTM machine = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] w = line.trim().split("\\s+");
            String[] words = w.length > 1 ? w[1].split(",", -1) : new String[0];
            switch (w[0]) {
                case "machine" -> machine = new MultiTapeTM(Integer.parseInt(w[1]), w[2]);
                case "rule" -> machine.addRule(w[1], w[2], w[3], w[4], w[5]);
                case "run" -> {
                    MultiTapeTM.Result r = machine.run(words, 500);
                    List<String> tapes = new ArrayList<>();
                    for (StringBuilder t : r.tapes()) {
                        String s = t.toString().replaceAll("_+$", "");
                        tapes.add(s.isEmpty() ? "_" : s);
                    }
                    out.append(verdict(r.verdict()) + " after " + plural(r.moves()) + ": "
                            + String.join(" | ", tapes) + "\n");
                }
                case "simulate" -> {
                    MultiTapeTM.SimResult r = machine.simulate(words, 100);
                    StringBuilder tape = new StringBuilder();
                    for (int i = 0; i < r.tape().length(); i++) {
                        boolean marked = false;
                        for (int m : r.marks()) marked |= m == i;
                        char a = r.tape().charAt(i);
                        tape.append(marked ? "[" + a + "]" : String.valueOf(a));
                    }
                    out.append(verdict(r.verdict()) + " after " + plural(r.moves()) + " of M and "
                            + r.steps() + " on one tape: " + tape + "\n");
                }
                default -> {}
            }
        }
        System.out.print(out);
    }
}
