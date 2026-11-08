import java.io.*;
import java.util.*;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   policy refuse | first        parse with conflicts: refuse, or take the first rule
 *   load E -> T X; X -> + T X; X -> eps     one rule per item, symbols spaced
 *   first / follow               prints "E: ( a; X: + eps; ..." (sorted, variables in order)
 *   table                        prints "conflicts N"
 *   parse a+a                    prints "accept 9", "reject 4", "gave-up 40" or "refuse"
 */
public class Main {
    static List<String> variables = new ArrayList<>();

    static List<Ll1.Rule> load(String text) {
        List<Ll1.Rule> rules = new ArrayList<>();
        for (String item : text.split(";")) {
            String[] sides = item.split("->");
            List<String> body = new ArrayList<>(Arrays.asList(sides[1].trim().split("\\s+")));
            if (body.equals(List.of("eps"))) body.clear();
            Ll1.Rule r = new Ll1.Rule(sides[0].trim(), body);
            if (!rules.contains(r)) rules.add(r);
        }
        variables = new ArrayList<>(List.of(rules.get(0).head()));
        List<String> all = new ArrayList<>();
        for (Ll1.Rule r : rules) all.add(r.head());
        for (Ll1.Rule r : rules) all.addAll(r.body());
        for (String s : all) if (Ll1.isVar(s) && !variables.contains(s)) variables.add(s);
        return rules;
    }

    static String show(Map<String, Set<String>> sets) {
        List<String> parts = new ArrayList<>();
        for (String v : variables) parts.add(v + ": " + String.join(" ", sets.get(v)));
        return String.join("; ", parts);
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        boolean refuse = true;
        Ll1 p = null;
        for (String line; (line = in.readLine()) != null; ) {
            String[] w = line.trim().split(" ", 2);
            switch (w[0]) {
                case "policy" -> refuse = w[1].equals("refuse");
                case "load" -> p = new Ll1(load(w[1]), variables);
                case "first" -> System.out.println(show(p.first));
                case "follow" -> System.out.println(show(p.follow));
                case "table" -> System.out.println("conflicts " + p.conflicts());
                case "parse" -> System.out.println(refuse && p.conflicts() > 0
                        ? "refuse" : p.parse(w[1].equals("eps") ? "" : w[1], 40));
                default -> { }
            }
        }
    }
}
