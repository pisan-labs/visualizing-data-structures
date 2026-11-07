import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

/**
 * Test driver: reads one operation per line, prints one result per line. "load S0 -> U1 S1 |
 * eps; ..." loads a grammar in CNF, symbols separated by spaces (and prints nothing); "parse
 * aabb" prints "yes" or "no", then the variables in the top cell.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        List<Cyk.Rule> rules = new ArrayList<>();
        List<String> order = new ArrayList<>(List.of("S"));
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split(" ", 2);
            String arg = parts.length > 1 ? parts[1].trim() : "";
            if (parts[0].equals("load")) {
                rules = new ArrayList<>();
                order = new ArrayList<>();
                for (String item : arg.split(";")) {
                    String[] sides = item.split("->", 2);
                    String head = sides[0].trim();
                    order.add(head);
                    for (String alt : sides[1].split("\\|")) {
                        List<String> body = Arrays.asList(alt.trim().split("\\s+"));
                        if (body.equals(List.of("eps"))) body = List.of();
                        rules.add(new Cyk.Rule(head, body));
                    }
                }
            } else if (parts[0].equals("parse")) {
                List<String> word = new ArrayList<>();
                if (!arg.equals("eps")) for (char c : arg.toCharArray()) word.add(String.valueOf(c));
                StringBuilder result = new StringBuilder(Cyk.accepts(rules, order.get(0), word) ? "yes" : "no");
                if (!word.isEmpty()) {
                    Set<String> top = Cyk.table(rules, word).get(word.size()).get(0);
                    for (String v : order) if (top.contains(v)) result.append(" ").append(v);
                }
                out.append(result).append("\n");
            }
        }
        System.out.print(out);
    }
}
