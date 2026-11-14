import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;

public class StateBfs {
    /** BFS over states made on the fly: the fewest moves from start to goal, or -1. */
    static int fewestMoves(
            String start, String goal, Function<String, List<String>> moves, Predicate<String> allowed) {
        if (start.equals(goal)) return 0;
        Map<String, Integer> dist = new HashMap<>(); // the visited set, with distances
        dist.put(start, 0);
        ArrayDeque<String> queue = new ArrayDeque<>();
        queue.add(start);
        while (!queue.isEmpty()) {
            String s = queue.poll();
            for (String t : moves.apply(s)) { // the graph is never stored: make them now
                if (!allowed.test(t) || dist.containsKey(t)) continue;
                if (t.equals(goal)) return dist.get(s) + 1;
                dist.put(t, dist.get(s) + 1);
                queue.add(t);
            }
        }
        return -1;
    }

    /** Turn each wheel up, then down; 9 wraps round to 0. */
    static List<String> turns(String s) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < s.length(); i++) {
            for (int step : new int[] {1, -1}) {
                char c = (char) ('0' + (s.charAt(i) - '0' + step + 10) % 10);
                out.add(s.substring(0, i) + c + s.substring(i + 1));
            }
        }
        return out;
    }

    /** Change one letter at a time, a to z. */
    static List<String> letterChanges(String w) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < w.length(); i++) {
            for (char c = 'a'; c <= 'z'; c++) {
                if (c != w.charAt(i)) out.add(w.substring(0, i) + c + w.substring(i + 1));
            }
        }
        return out;
    }

    /** Fewest turns from all zeros to goal, never showing a barred combination. */
    public static int lockMoves(List<String> barred, String goal) {
        Set<String> bar = Set.copyOf(barred);
        return fewestMoves("0".repeat(goal.length()), goal, StateBfs::turns, t -> !bar.contains(t));
    }

    /** Fewest one-letter changes from words[0] to goal, every step a word in the list. */
    public static int wordMoves(List<String> words, String goal) {
        Set<String> known = Set.copyOf(words);
        return fewestMoves(words.get(0), goal, StateBfs::letterChanges, known::contains);
    }
}
