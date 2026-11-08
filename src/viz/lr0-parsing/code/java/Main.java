import java.io.*;
import java.util.*;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   method lr0 | slr1                 where reduces go in the table
 *   load E -> E + T; E -> T; T -> a   one rule per item, symbols spaced (Start -> S is added)
 *   table                             prints "states N conflicts K"
 *   parse a+a                         prints "accept 7", "reject 3" or "refuse" (conflicts)
 */
public class Main {
    static List<Lr0.Rule> load(String text) {
        List<Lr0.Rule> rules = new ArrayList<>();
        for (String item : text.split(";")) {
            String[] sides = item.split("->");
            List<String> body = new ArrayList<>(Arrays.asList(sides[1].trim().split("\\s+")));
            if (body.equals(List.of("eps"))) body.clear();
            Lr0.Rule r = new Lr0.Rule(sides[0].trim(), body);
            if (!rules.contains(r)) rules.add(r);
        }
        rules.add(0, new Lr0.Rule("Start", List.of(rules.get(0).head())));
        return rules;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        boolean slr = false;
        Lr0 p = null;
        for (String line; (line = in.readLine()) != null; ) {
            String[] w = line.trim().split(" ", 2);
            switch (w[0]) {
                case "method" -> slr = w[1].equals("slr1");
                case "load" -> {
                    List<Lr0.Rule> rules = load(w[1]);
                    p = new Lr0(rules, slr ? Lr0.follow(rules) : null);
                }
                case "table" -> System.out.println("states " + p.sets.size() + " conflicts " + p.conflicts());
                case "parse" -> System.out.println(p.conflicts() > 0
                        ? "refuse" : p.parse(w[1].equals("eps") ? "" : w[1], 200));
                default -> { }
            }
        }
    }
}
