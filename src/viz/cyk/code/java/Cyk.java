import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * CYK: decides whether a grammar in Chomsky normal form generates a word. A rule's body is one
 * terminal, two variables, or nothing (for start -> eps).
 */
public class Cyk {
    public record Rule(String head, List<String> body) {}

    /** table.get(length).get(i): the variables that derive the substring of that length at i. */
    public static List<List<Set<String>>> table(List<Rule> rules, List<String> word) {
        int n = word.size();
        List<List<Set<String>>> table = new ArrayList<>();
        for (int length = 0; length <= n; length++) {
            List<Set<String>> row = new ArrayList<>();
            for (int i = 0; i + length <= n; i++) row.add(new HashSet<>());
            table.add(row);
        }
        for (int i = 0; i < n; i++) {
            for (Rule r : rules) {
                if (r.body().size() == 1 && r.body().get(0).equals(word.get(i))) {
                    table.get(1).get(i).add(r.head());
                }
            }
        }
        for (int length = 2; length <= n; length++) {
            for (int i = 0; i + length <= n; i++) {
                for (int k = 1; k < length; k++) { // the left part has k symbols
                    Set<String> left = table.get(k).get(i);
                    Set<String> right = table.get(length - k).get(i + k);
                    for (Rule r : rules) {
                        if (r.body().size() == 2 && left.contains(r.body().get(0))
                                && right.contains(r.body().get(1))) {
                            table.get(length).get(i).add(r.head());
                        }
                    }
                }
            }
        }
        return table;
    }

    public static boolean accepts(List<Rule> rules, String start, List<String> word) {
        if (word.isEmpty()) {
            return rules.stream().anyMatch(r -> r.head().equals(start) && r.body().isEmpty());
        }
        return table(rules, word).get(word.size()).get(0).contains(start);
    }
}
