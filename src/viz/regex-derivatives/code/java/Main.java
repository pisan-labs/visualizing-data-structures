import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Iterator;

/**
 * Test driver: reads one operation per line, prints one result per line. "regex <prefix form>"
 * reads an expression, such as ". * | a b a" for (a|b)*a (prints nothing); "derive c" prints the
 * derivative by c; "match w" prints accept or reject (eps is the empty word); "dfa" prints
 * "k states, j accepting" or "more than 8 states".
 */
public class Main {
    static Derivatives.Rx parse(Iterator<String> tokens) {
        String t = tokens.next();
        return switch (t) {
            case "|", "." -> Derivatives.node(t, parse(tokens), parse(tokens));
            case "*", "+", "?" -> Derivatives.node(t, parse(tokens), null);
            case "eps" -> Derivatives.EPS;
            case "empty" -> Derivatives.EMPTY;
            default -> Derivatives.sym(t.charAt(0));
        };
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in =
            new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        Derivatives.Rx r = Derivatives.EMPTY;
        String line;
        while ((line = in.readLine()) != null) {
            String[] w = line.trim().split("\\s+");
            switch (w[0]) {
                case "regex" -> r = parse(Arrays.asList(w).subList(1, w.length).iterator());
                case "derive" -> out.println(Derivatives.show(Derivatives.derive(r, w[1].charAt(0))));
                case "match" -> {
                    String word = w[1].equals("eps") ? "" : w[1];
                    out.println(Derivatives.matches(r, word) ? "accept" : "reject");
                }
                case "dfa" -> {
                    int[] d = Derivatives.dfa(r, 8);
                    out.println(d == null ? "more than 8 states" : d[0] + " states, " + d[1] + " accepting");
                }
                default -> { }
            }
        }
    }
}
