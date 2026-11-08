import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Aho-Corasick: a trie of the patterns plus a failure link per node (the longest proper suffix of
 * its string that is also in the trie) and an output link (the nearest node down the failure
 * chain that ends a pattern).
 */
public final class AhoCorasick {
    private final List<Map<Character, Integer>> kids = new ArrayList<>();
    private final List<String> word = new ArrayList<>();
    private int[] fail;
    private int[] dict; // -1: none

    public AhoCorasick(List<String> patterns) {
        kids.add(new TreeMap<>());
        word.add(null);
        for (String p : patterns) {
            int u = 0;
            for (char c : p.toCharArray()) {
                Integer v = kids.get(u).get(c);
                if (v == null) {
                    kids.add(new TreeMap<>());
                    word.add(null);
                    v = kids.size() - 1;
                    kids.get(u).put(c, v);
                }
                u = v;
            }
            word.set(u, p);
        }
        buildLinks();
    }

    private void buildLinks() {
        int n = kids.size();
        fail = new int[n];
        dict = new int[n];
        java.util.Arrays.fill(dict, -1);
        ArrayDeque<Integer> queue = new ArrayDeque<>(kids.get(0).values()); // depth 1 fails to root
        while (!queue.isEmpty()) {
            int u = queue.poll();
            for (Map.Entry<Character, Integer> e : kids.get(u).entrySet()) {
                char c = e.getKey();
                int v = e.getValue();
                int f = fail[u];
                while (f != 0 && !kids.get(f).containsKey(c)) {
                    f = fail[f];
                }
                int g = kids.get(f).getOrDefault(c, 0);
                fail[v] = g != v ? g : 0;
                int t = fail[v];
                dict[v] = word.get(t) != null ? t : dict[t];
                queue.add(v);
            }
        }
    }

    /** "start:word" for every match, in the order the scan finds them. */
    public List<String> search(String text) {
        List<String> found = new ArrayList<>();
        int u = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            while (u != 0 && !kids.get(u).containsKey(c)) {
                u = fail[u];
            }
            u = kids.get(u).getOrDefault(c, 0);
            for (int d = word.get(u) != null ? u : dict[u]; d != -1; d = dict[d]) {
                String w = word.get(d);
                found.add((i - w.length() + 1) + ":" + w);
            }
        }
        return found;
    }
}
