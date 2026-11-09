import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/** Brzozowski derivatives of regular expressions. */
public class Derivatives {
    /**
     * An expression: kind is "sym" (the symbol c), "eps", "empty", "|" (union), "." (concatenation),
     * "*", "+" (one or more) or "?" (optional); a and b are its parts.
     */
    public record Rx(String kind, Rx a, Rx b, char c) {}

    public static final Rx EMPTY = new Rx("empty", null, null, ' ');
    public static final Rx EPS = new Rx("eps", null, null, ' ');

    public static Rx sym(char c) { return new Rx("sym", null, null, c); }

    public static Rx node(String kind, Rx a, Rx b) { return new Rx(kind, a, b, ' '); }

    static int prec(Rx r) {
        return switch (r.kind()) {
            case "|" -> 0;
            case "." -> 1;
            case "*", "+", "?" -> 2;
            default -> 3;
        };
    }

    static String wrap(Rx r, int least) { return prec(r) < least ? "(" + show(r) + ")" : show(r); }

    /** The expression's text, with only the parentheses it needs. */
    public static String show(Rx r) {
        return switch (r.kind()) {
            case "sym" -> String.valueOf(r.c());
            case "eps" -> "ε";
            case "empty" -> "∅";
            case "|" -> wrap(r.a(), 0) + "|" + wrap(r.b(), 1);
            case "." -> wrap(r.a(), 1) + wrap(r.b(), 1);
            default -> wrap(r.a(), 3) + r.kind(); // *, + or ?
        };
    }

    /** Does r match the empty word? */
    public static boolean nullable(Rx r) {
        return switch (r.kind()) {
            case "eps", "*", "?" -> true;
            case "empty", "sym" -> false;
            case "|" -> nullable(r.a()) || nullable(r.b());
            case "." -> nullable(r.a()) && nullable(r.b());
            default -> nullable(r.a()); // r+
        };
    }

    // Smart constructors: they simplify as they build.

    static void alternatives(Rx r, List<Rx> out) {
        if (r.kind().equals("|")) {
            alternatives(r.a(), out);
            alternatives(r.b(), out);
        } else out.add(r);
    }

    /** r|s, with ∅ dropped and the alternatives sorted by their text, without repeats. */
    static Rx union(Rx r, Rx s) {
        List<Rx> all = new ArrayList<>();
        alternatives(r, all);
        alternatives(s, all);
        TreeMap<String, Rx> alts = new TreeMap<>();
        for (Rx x : all) if (!x.equals(EMPTY)) alts.put(show(x), x);
        Rx out = EMPTY;
        for (Rx x : alts.values()) out = out.equals(EMPTY) ? x : node("|", out, x);
        return out;
    }

    static Rx concat(Rx r, Rx s) {
        if (r.equals(EMPTY) || s.equals(EMPTY)) return EMPTY;
        if (r.equals(EPS)) return s;
        if (s.equals(EPS)) return r;
        if (r.kind().equals(".")) return concat(r.a(), concat(r.b(), s)); // r(st), not (rs)t
        return node(".", r, s);
    }

    static Rx star(Rx r) {
        if (r.equals(EMPTY) || r.equals(EPS)) return EPS;
        return r.kind().equals("*") ? r : node("*", r, null);
    }

    static Rx simplify(Rx r) {
        return switch (r.kind()) {
            case "|" -> union(simplify(r.a()), simplify(r.b()));
            case "." -> concat(simplify(r.a()), simplify(r.b()));
            case "*" -> star(simplify(r.a()));
            case "+", "?" -> node(r.kind(), simplify(r.a()), null);
            default -> r;
        };
    }

    /** What is left of r after reading the symbol c. */
    public static Rx derive(Rx r, char c) {
        switch (r.kind()) {
            case "eps", "empty": return EMPTY;
            case "sym": return r.c() == c ? EPS : EMPTY;
            case "|": return union(derive(r.a(), c), derive(r.b(), c));
            case ".": {
                Rx left = concat(derive(r.a(), c), simplify(r.b()));
                return nullable(r.a()) ? union(left, derive(r.b(), c)) : left;
            }
            case "*": return concat(derive(r.a(), c), simplify(r));
            case "+": return concat(derive(r.a(), c), star(simplify(r.a())));
            default: return derive(r.a(), c); // r?
        }
    }

    /** Takes one derivative per symbol; the word matches if what is left matches ε. */
    public static boolean matches(Rx r, String word) {
        r = simplify(r);
        for (char c : word.toCharArray()) {
            if (r.equals(EMPTY)) return false;
            r = derive(r, c);
        }
        return nullable(r);
    }

    static void symbols(Rx r, Set<Character> out) {
        if (r == null) return;
        if (r.kind().equals("sym")) out.add(r.c());
        symbols(r.a(), out);
        symbols(r.b(), out);
    }

    /** The DFA whose states are the derivatives of r: {states, accepting}, or null if too many. */
    public static int[] dfa(Rx r, int maxStates) {
        List<Rx> states = new ArrayList<>(List.of(simplify(r)));
        Set<String> seen = new HashSet<>(List.of(show(states.get(0))));
        Set<Character> alphabet = new TreeSet<>();
        symbols(states.get(0), alphabet);
        for (int i = 0; i < states.size(); i++)
            for (char c : alphabet) {
                Rx d = derive(states.get(i), c);
                if (seen.contains(show(d))) continue;
                if (states.size() == maxStates) return null;
                seen.add(show(d));
                states.add(d);
            }
        int accepting = 0;
        for (Rx q : states) if (nullable(q)) accepting++;
        return new int[] {states.size(), accepting};
    }
}
