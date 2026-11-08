import java.util.*;

/** Converts a context-free grammar to Chomsky normal form. Variables start with a capital. */
public class Cnf {
    /** A rule head -> body; an empty body is eps. */
    public record Rule(String head, List<String> body) {}

    private final Set<String> used = new HashSet<>();

    static boolean isVar(String s) { return Character.isUpperCase(s.charAt(0)); }

    static boolean isUnit(List<String> b) { return b.size() == 1 && isVar(b.get(0)); }

    private String fresh(String letter, int k) {
        while (used.contains(letter + k)) k++;
        used.add(letter + k);
        return letter + k;
    }

    public List<Rule> convert(List<Rule> input, boolean termFirst) {
        for (Rule r : input) {
            used.add(r.head());
            for (String s : r.body()) if (isVar(s)) used.add(s);
        }
        String first = input.get(0).head();
        String start = fresh(first.substring(0, 1), 0);
        List<Rule> rules = new ArrayList<>();
        rules.add(new Rule(start, List.of(first))); // START
        rules.addAll(input);

        // DEL: find the nullable variables, then copy rules with some of them left out.
        Set<String> nullable = new HashSet<>();
        for (boolean changed = true; changed; ) {
            changed = false;
            for (Rule r : rules)
                if (!nullable.contains(r.head()) && nullable.containsAll(r.body()))
                    changed = nullable.add(r.head());
        }
        if (!nullable.isEmpty()) {
            for (int i = 0; i < rules.size(); i++) {
                Rule r = rules.get(i);
                List<Integer> at = new ArrayList<>();
                for (int k = 0; k < r.body().size(); k++)
                    if (nullable.contains(r.body().get(k))) at.add(k);
                int added = 0;
                for (int mask = 1; mask < (1 << at.size()); mask++) {
                    List<String> body = new ArrayList<>();
                    for (int k = 0; k < r.body().size(); k++) {
                        int j = at.indexOf(k);
                        if (j < 0 || (mask >> j & 1) == 0) body.add(r.body().get(k));
                    }
                    Rule v = new Rule(r.head(), body);
                    if (!body.isEmpty() && !body.equals(List.of(r.head())) && !rules.contains(v))
                        rules.add(i + ++added, v);
                }
                i += added;
            }
            rules.removeIf(r -> r.body().isEmpty() || r.body().equals(List.of(r.head())));
            if (nullable.contains(start)) rules.add(new Rule(start, List.of()));
        }

        // UNIT: each variable takes the other rules of every variable it becomes.
        if (rules.stream().anyMatch(r -> isUnit(r.body()))) {
            Set<String> heads = new LinkedHashSet<>();
            for (Rule r : rules) heads.add(r.head());
            List<Rule> next = new ArrayList<>();
            for (String a : heads) {
                List<String> reach = new ArrayList<>(List.of(a));
                for (int k = 0; k < reach.size(); k++)
                    for (Rule r : rules)
                        if (r.head().equals(reach.get(k)) && isUnit(r.body())
                                && !reach.contains(r.body().get(0)))
                            reach.add(r.body().get(0));
                for (String b : reach)
                    for (Rule r : rules) {
                        Rule v = new Rule(a, r.body());
                        if (r.head().equals(b) && !isUnit(r.body()) && !next.contains(v)) next.add(v);
                    }
            }
            rules = next;
        }
        return termFirst ? split(term(rules)) : term(split(rules));
    }

    /** TERM: a variable for each terminal in a right side of two or more symbols. */
    private List<Rule> term(List<Rule> rules) {
        Map<String, String> names = new LinkedHashMap<>();
        for (Rule r : rules)
            for (String s : r.body())
                if (r.body().size() >= 2 && !isVar(s) && !names.containsKey(s))
                    names.put(s, fresh("U", 1));
        List<Rule> out = new ArrayList<>();
        for (Rule r : rules) {
            if (r.body().size() < 2) { out.add(r); continue; }
            out.add(new Rule(r.head(), r.body().stream().map(s -> names.getOrDefault(s, s)).toList()));
        }
        names.forEach((a, u) -> out.add(new Rule(u, List.of(a))));
        return out;
    }

    /** BIN: break each right side of three or more symbols into a chain of pairs. */
    private List<Rule> split(List<Rule> rules) {
        List<Rule> out = new ArrayList<>();
        for (Rule r : rules) {
            List<String> b = r.body();
            String h = r.head();
            for (int i = 0; i + 2 < b.size(); i++) {
                String v = fresh(r.head().substring(0, 1), 1);
                out.add(new Rule(h, List.of(b.get(i), v)));
                h = v;
            }
            out.add(new Rule(h, b.size() > 2 ? b.subList(b.size() - 2, b.size()) : b));
        }
        return out;
    }
}
