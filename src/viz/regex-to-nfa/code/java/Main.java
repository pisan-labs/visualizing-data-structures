import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   build <regex>  ->  "<n> states, <m> moves", or "error"
 *   run <word>     ->  "accept" or "reject" (ε or eps is the empty word), or "error"
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in =
                new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        ThompsonNfa nfa = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            String arg = parts.length > 1 ? parts[1] : "";
            switch (parts[0]) {
                case "build" -> {
                    try {
                        nfa = new ThompsonNfa(arg);
                        out.append(nfa.states()).append(" states, ")
                                .append(nfa.moveCount()).append(" moves\n");
                    } catch (IllegalArgumentException e) {
                        out.append("error\n");
                    }
                }
                case "run" -> {
                    String word = arg.equals("ε") || arg.equals("eps") ? "" : arg;
                    boolean ok = word.chars().allMatch(c -> c < 128 && Character.isLetterOrDigit(c));
                    out.append(!ok ? "error" : nfa.accepts(word) ? "accept" : "reject").append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
