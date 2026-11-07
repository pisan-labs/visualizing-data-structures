import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line.
 * "classify S -> aSb | eps" prints "context-free (not regular: S -> aSb)".
 */
public class Main {
    static String show(Chomsky.Rule r) {
        return r.left() + " -> " + (r.right().isEmpty() ? "eps" : r.right());
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split(" ", 2);
            if (!parts[0].equals("classify")) continue;
            List<Chomsky.Rule> rules = new ArrayList<>();
            for (String item : parts[1].split(";")) {
                String[] sides = item.split("->", 2);
                String left = sides[0].replaceAll("\\s", "");
                for (String alt : sides[1].split("\\|", -1)) {
                    String right = alt.replaceAll("\\s", "");
                    rules.add(new Chomsky.Rule(left, right.equals("eps") ? "" : right));
                }
            }
            char start = 0;
            for (char c : rules.get(0).left().toCharArray()) {
                if (Chomsky.isVariable(c)) {
                    start = c;
                    break;
                }
            }
            Chomsky.Result r = Chomsky.classify(rules, start);
            out.append(r.level());
            if (r.below() != null) {
                int k = Arrays.asList(Chomsky.LEVELS).indexOf(r.level());
                out.append(" (not ").append(Chomsky.LEVELS[k - 1]).append(": ");
                out.append(show(r.below())).append(")");
            }
            out.append("\n");
        }
        System.out.print(out);
    }
}
