import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** The Myhill–Nerode classes of the language of a complete DFA. */
public class Nerode {
    private final List<String> alphabet; // in order
    private final String start;
    private final Set<String> accept;
    private final Map<String, String> delta; // "q a" -> next state

    public Nerode(List<String> alphabet, String start, Set<String> accept, Map<String, String> delta) {
        this.alphabet = alphabet;
        this.start = start;
        this.accept = accept;
        this.delta = delta;
    }

    String next(String q, String c) { return delta.get(q + " " + c); }

    String run(String word) {
        String q = start;
        for (char c : word.toCharArray()) q = next(q, String.valueOf(c));
        return q;
    }

    /**
     * The shortest suffix z with exactly one of xz and yz in L, or null if x ≡ y: a breadth-first
     * search over pairs of states, symbols in alphabet order.
     */
    public String apart(String x, String y) {
        record Item(String p, String q, String z) {}
        ArrayDeque<Item> queue = new ArrayDeque<>();
        Set<String> seen = new HashSet<>();
        Item first = new Item(run(x), run(y), "");
        queue.add(first);
        seen.add(first.p() + "|" + first.q());
        while (!queue.isEmpty()) {
            Item it = queue.poll();
            if (accept.contains(it.p()) != accept.contains(it.q())) return it.z();
            for (String c : alphabet) {
                Item n = new Item(next(it.p(), c), next(it.q(), c), it.z() + c);
                if (seen.add(n.p() + "|" + n.q())) queue.add(n);
            }
        }
        return null;
    }

    /** One move between classes: from class, symbol, to class. */
    public record Move(int from, String on, int to) {}

    /**
     * The classes of ≡_L, each named by its shortest word, in `words`, and the moves between
     * them in `moves`. Returns false when there are more than `most` classes.
     */
    public boolean classes(int most, List<String> words, List<Move> moves) {
        words.add("");
        for (int i = 0; i < words.size(); i++)
            for (String c : alphabet) {
                String x = words.get(i) + c;
                int j = 0;
                while (j < words.size() && apart(x, words.get(j)) != null) j++;
                if (j == words.size()) { // told apart from every class so far: a new class
                    if (words.size() == most) return false;
                    words.add(x);
                }
                moves.add(new Move(i, c, j));
            }
        return true;
    }
}
