import java.io.*;
import java.util.*;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   order bin-first                          BIN before TERM from now on (Sipser)
 *   convert S -> A S A | a B; B -> b | eps   prints the grammar in CNF, symbols spaced
 */
public class Main {
    static List<Cnf.Rule> parse(String text) {
        List<Cnf.Rule> rules = new ArrayList<>();
        for (String item : text.split(";")) {
            String[] sides = item.split("->");
            for (String alt : sides[1].split("\\|")) {
                List<String> body = new ArrayList<>(Arrays.asList(alt.trim().split("\\s+")));
                if (body.equals(List.of("eps"))) body.clear();
                Cnf.Rule r = new Cnf.Rule(sides[0].trim(), body);
                if (!rules.contains(r)) rules.add(r);
            }
        }
        return rules;
    }

    static String show(List<Cnf.Rule> rules) {
        Map<String, List<String>> alts = new LinkedHashMap<>();
        for (Cnf.Rule r : rules)
            alts.computeIfAbsent(r.head(), k -> new ArrayList<>())
                .add(r.body().isEmpty() ? "eps" : String.join(" ", r.body()));
        List<String> parts = new ArrayList<>();
        alts.forEach((h, bs) -> parts.add(h + " -> " + String.join(" | ", bs)));
        return String.join("; ", parts);
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        boolean termFirst = true;
        for (String line; (line = in.readLine()) != null; ) {
            String[] p = line.trim().split(" ", 2);
            switch (p[0]) {
                case "order" -> termFirst = p[1].trim().equals("term-first");
                case "convert" -> System.out.println(show(new Cnf().convert(parse(p[1]), termFirst)));
                default -> { }
            }
        }
    }
}
