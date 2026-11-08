import java.util.*;

/** LR(0) and SLR(1) parsing: item sets, the ACTION/GOTO table, and a shift-reduce parse. */
public class Lr0 {
    public static final String END = "$";

    /** A rule head -> body; an empty body is eps. rules.get(0) is the augmented S' -> S. */
    public record Rule(String head, List<String> body) {}

    /** An item: a rule with a dot before body[dot]. */
    record Item(int rule, int dot) {}

    /** An action: 's' shift to n, 'r' reduce by rule n, 'a' accept. */
    record Act(char kind, int n) {}

    final List<Rule> rules;
    final List<List<Item>> sets = new ArrayList<>();
    final Map<String, Integer> edges = new LinkedHashMap<>(), gotoT = new HashMap<>();
    final Map<String, List<Act>> action = new HashMap<>();

    static boolean isVar(String s) { return Character.isUpperCase(s.charAt(0)); }

    String next(Item it) {
        List<String> b = rules.get(it.rule()).body();
        return it.dot() < b.size() ? b.get(it.dot()) : null;
    }

    List<Item> closure(List<Item> kernel) {
        List<Item> out = new ArrayList<>(kernel);
        for (int k = 0; k < out.size(); k++) {
            String b = next(out.get(k));
            if (b == null || !isVar(b)) continue;
            for (int r = 0; r < rules.size(); r++) {
                Item x = new Item(r, 0);
                if (rules.get(r).head().equals(b) && !out.contains(x)) out.add(x);
            }
        }
        return out;
    }

    public Lr0(List<Rule> rules, Map<String, Set<String>> follow) {
        this.rules = rules;
        sets.add(closure(List.of(new Item(0, 0))));
        for (int i = 0; i < sets.size(); i++) {
            List<String> symbols = new ArrayList<>();
            for (Item it : sets.get(i)) {
                String x = next(it);
                if (x != null && !symbols.contains(x)) symbols.add(x);
            }
            for (String x : symbols) {
                List<Item> kernel = new ArrayList<>();
                for (Item it : sets.get(i)) if (x.equals(next(it))) kernel.add(new Item(it.rule(), it.dot() + 1));
                Set<Item> full = new HashSet<>(closure(kernel));
                int j = 0;
                while (j < sets.size() && !new HashSet<>(sets.get(j)).equals(full)) j++;
                if (j == sets.size()) sets.add(closure(kernel));
                edges.put(i + " " + x, j);
            }
        }
        Set<String> terminals = new TreeSet<>();
        for (Rule r : rules) for (String s : r.body()) if (!isVar(s)) terminals.add(s);
        terminals.add(END);
        edges.forEach((k, j) -> {
            String x = k.split(" ")[1];
            if (isVar(x)) gotoT.put(k, j);
            else action.computeIfAbsent(k, z -> new ArrayList<>()).add(new Act('s', j));
        });
        for (int i = 0; i < sets.size(); i++)
            for (Item it : sets.get(i)) {
                if (next(it) != null) continue;
                if (it.rule() == 0) {
                    action.computeIfAbsent(i + " " + END, z -> new ArrayList<>()).add(new Act('a', 0));
                    continue;
                }
                String head = rules.get(it.rule()).head();
                for (String a : follow == null ? terminals : follow.get(head))
                    action.computeIfAbsent(i + " " + a, z -> new ArrayList<>()).add(new Act('r', it.rule()));
            }
    }

    public long conflicts() { return action.values().stream().filter(l -> l.size() > 1).count(); }

    /** Returns "accept" or "reject", then the moves made. */
    public String parse(String word, int cap) {
        List<Integer> stack = new ArrayList<>(List.of(0));
        String in = word + END;
        int pos = 0, moves = 0;
        while (true) {
            List<Act> acts = action.get(stack.get(stack.size() - 1) + " " + in.charAt(pos));
            if (acts == null || moves >= cap) return "reject " + moves;
            Act act = acts.get(0);
            if (act.kind() == 'a') return "accept " + moves;
            if (act.kind() == 's') {
                stack.add(act.n());
                pos++;
            } else {
                Rule r = rules.get(act.n());
                for (int k = 0; k < r.body().size(); k++) stack.remove(stack.size() - 1);
                Integer to = gotoT.get(stack.get(stack.size() - 1) + " " + r.head());
                if (to == null) return "reject " + moves;
                stack.add(to);
            }
            moves++;
        }
    }

    /** FOLLOW of each variable, for SLR(1). */
    public static Map<String, Set<String>> follow(List<Rule> rules) {
        Map<String, Set<String>> first = new HashMap<>(), follow = new HashMap<>();
        for (Rule r : rules) { first.put(r.head(), new HashSet<>()); follow.put(r.head(), new HashSet<>()); }
        for (boolean changed = true; changed; ) {
            changed = false;
            for (Rule r : rules) changed |= first.get(r.head()).addAll(firstOf(first, r.body()));
        }
        follow.get(rules.get(0).head()).add(END);
        for (boolean changed = true; changed; ) {
            changed = false;
            for (Rule r : rules)
                for (int k = 0; k < r.body().size(); k++) {
                    String b = r.body().get(k);
                    if (!isVar(b)) continue;
                    Set<String> rest = firstOf(first, r.body().subList(k + 1, r.body().size()));
                    if (rest.remove("")) rest.addAll(follow.get(r.head()));
                    changed |= follow.computeIfAbsent(b, z -> new HashSet<>()).addAll(rest);
                }
        }
        return follow;
    }

    static Set<String> firstOf(Map<String, Set<String>> first, List<String> symbols) {
        Set<String> out = new HashSet<>();
        for (String s : symbols) {
            if (!isVar(s)) { out.add(s); return out; }
            Set<String> f = first.getOrDefault(s, Set.of());
            for (String x : f) if (!x.isEmpty()) out.add(x);
            if (!f.contains("")) return out;
        }
        out.add("");
        return out;
    }
}
