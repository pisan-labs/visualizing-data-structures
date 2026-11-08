import java.util.*;

/** LL(1) parsing: FIRST and FOLLOW sets, the parse table, and a predictive parse. */
public class Ll1 {
    public static final String EPS = "eps", END = "$";

    /** A rule head -> body; an empty body is eps. */
    public record Rule(String head, List<String> body) {}

    final List<Rule> rules;
    final Map<String, Set<String>> first = new HashMap<>(), follow = new HashMap<>();
    /** table.get(head + " " + a) lists the rules for that cell; two or more is a conflict. */
    final Map<String, List<Integer>> table = new HashMap<>();

    static boolean isVar(String s) { return Character.isUpperCase(s.charAt(0)); }

    Set<String> firstOf(List<String> symbols) {
        Set<String> out = new TreeSet<>();
        for (String s : symbols) {
            if (!isVar(s)) { out.add(s); return out; }
            Set<String> f = first.get(s);
            for (String x : f) if (!x.equals(EPS)) out.add(x);
            if (!f.contains(EPS)) return out;
        }
        out.add(EPS);
        return out;
    }

    public Ll1(List<Rule> rules, List<String> variables) {
        this.rules = rules;
        for (String v : variables) { first.put(v, new TreeSet<>()); follow.put(v, new TreeSet<>()); }
        for (boolean changed = true; changed; ) {
            changed = false;
            for (Rule r : rules) changed |= first.get(r.head()).addAll(firstOf(r.body()));
        }
        follow.get(rules.get(0).head()).add(END);
        for (boolean changed = true; changed; ) {
            changed = false;
            for (Rule r : rules)
                for (int k = 0; k < r.body().size(); k++) {
                    String b = r.body().get(k);
                    if (!isVar(b)) continue;
                    Set<String> rest = firstOf(r.body().subList(k + 1, r.body().size()));
                    boolean vanish = rest.remove(EPS);
                    if (vanish) rest.addAll(follow.get(r.head()));
                    changed |= follow.get(b).addAll(rest);
                }
        }
        for (int i = 0; i < rules.size(); i++) {
            Rule r = rules.get(i);
            Set<String> cols = firstOf(r.body());
            if (cols.remove(EPS)) cols.addAll(follow.get(r.head()));
            for (String a : cols) table.computeIfAbsent(r.head() + " " + a, k -> new ArrayList<>()).add(i);
        }
    }

    public long conflicts() { return table.values().stream().filter(l -> l.size() > 1).count(); }

    /** Returns "accept", "reject" or "gave-up", then the moves made. Takes the first rule in a cell. */
    public String parse(String word, int cap) {
        Deque<String> stack = new ArrayDeque<>(List.of(END, rules.get(0).head()));
        List<String> in = new ArrayList<>();
        for (char c : word.toCharArray()) in.add(String.valueOf(c));
        in.add(END);
        int pos = 0, moves = 0;
        while (true) {
            String top = stack.peekLast(), a = in.get(pos);
            if (top.equals(END) && a.equals(END)) return "accept " + moves;
            if (moves >= cap) return "gave-up " + moves;
            if (!isVar(top)) {
                if (!top.equals(a)) return "reject " + moves;
                stack.removeLast();
                pos++;
            } else {
                List<Integer> cell = table.get(top + " " + a);
                if (cell == null) return "reject " + moves;
                stack.removeLast();
                List<String> body = rules.get(cell.get(0)).body();
                for (int k = body.size() - 1; k >= 0; k--) stack.addLast(body.get(k));
            }
            moves++;
        }
    }
}
