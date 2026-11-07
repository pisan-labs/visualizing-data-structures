import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Finds a leftmost derivation by breadth-first search over sentential forms. A grammar maps
 * each variable to its right sides, in order. Capitals are variables, every other character is
 * a terminal, and "" is the empty word.
 */
public class Derivation {
    static final int CAP = 10000;

    /** The forms of the derivation (empty when there is none), or gaveUp at the cap. */
    public record Result(boolean gaveUp, List<String> forms) {}

    static int firstVariable(String form) {
        for (int i = 0; i < form.length(); i++) {
            if (Character.isUpperCase(form.charAt(i))) return i;
        }
        return -1;
    }

    /** Stands for "derives no word": longer than any form the search allows. */
    static final int NONE = 1_000_000;

    /** The length of the shortest word each variable derives (NONE: no word at all). */
    static Map<Character, Integer> shortestWords(Map<Character, List<String>> rules, Set<Character> variables) {
        Map<Character, Integer> best = new HashMap<>();
        for (char v : variables) best.put(v, NONE);
        boolean changed = true;
        while (changed) {
            changed = false;
            for (var e : rules.entrySet()) {
                for (String body : e.getValue()) {
                    int n = 0;
                    for (char c : body.toCharArray()) n += Character.isUpperCase(c) ? best.get(c) : 1;
                    if (n < best.get(e.getKey())) {
                        best.put(e.getKey(), n);
                        changed = true;
                    }
                }
            }
        }
        return best;
    }

    public static Result leftmost(Map<Character, List<String>> rules, char start, String word) {
        Set<Character> variables = new HashSet<>(rules.keySet());
        int widest = 1;
        for (List<String> bodies : rules.values()) {
            for (String b : bodies) {
                widest = Math.max(widest, b.length());
                for (char c : b.toCharArray()) if (Character.isUpperCase(c)) variables.add(c);
            }
        }
        Map<Character, Integer> shortest = shortestWords(rules, variables);
        int n = word.length();
        // No leftmost form in a smallest parse tree's derivation is longer than this.
        int longest = n + 1 + (widest - 1) * variables.size() * (n + 1);

        Map<String, String> parent = new HashMap<>();
        ArrayDeque<String> queue = new ArrayDeque<>();
        String first = String.valueOf(start);
        parent.put(first, null);
        queue.add(first);
        int tried = 0;
        while (!queue.isEmpty()) {
            if (tried == CAP) return new Result(true, List.of());
            String form = queue.poll();
            tried++;
            int i = firstVariable(form);
            for (String body : rules.getOrDefault(form.charAt(i), List.of())) {
                String child = form.substring(0, i) + body + form.substring(i + 1);
                if (parent.containsKey(child) || !fits(child, word, longest, shortest)) continue;
                parent.put(child, form);
                if (firstVariable(child) < 0) {
                    List<String> forms = new ArrayList<>();
                    for (String f = child; f != null; f = parent.get(f)) forms.add(f);
                    Collections.reverse(forms);
                    return new Result(false, forms);
                }
                queue.add(child);
            }
        }
        return new Result(false, List.of());
    }

    static boolean fits(String form, String word, int longest, Map<Character, Integer> shortest) {
        if (form.length() > longest) return false;
        int len = 0;
        for (char c : form.toCharArray()) len += Character.isUpperCase(c) ? shortest.get(c) : 1;
        if (len > word.length()) return false;
        int i = firstVariable(form);
        return i < 0 ? form.equals(word) : word.startsWith(form.substring(0, i));
    }
}
