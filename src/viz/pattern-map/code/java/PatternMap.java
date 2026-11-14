import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The pattern map as data: each family lists its cues, and each cue names the pattern it calls
 * for, by the id of the page that teaches it.
 */
public final class PatternMap {
    private static final Map<String, String[][]> MAP = new LinkedHashMap<>();
    private static final Map<String, String> PATTERN = new HashMap<>();

    static {
        MAP.put("Array and string tricks", new String[][] {
            {"count stretches with sum k", "prefix-sum-hashmap"},
            {"an exact sum, some negative", "prefix-sum-hashmap"},
            {"the largest sum of a stretch", "kadane"},
            {"same letters, any order", "frequency-counting"},
            {"the first one seen once", "frequency-counting"},
            {"add x to every cell l..r", "difference-array"},
            {"many updates, then one read", "difference-array"},
            {"three kinds, one pass", "dutch-flag"},
            {"below, equal, above a pivot", "dutch-flag"},
            {"the numbers 1 to n", "cyclic-sort"},
            {"missing and repeated in 1..n", "cyclic-sort"},
            {"spiral order of a grid", "matrix-traversal"},
            {"rotate a square in place", "matrix-traversal"},
        });
        MAP.put("Techniques", new String[][] {
            {"a pair with sum k, sorted", "two-pointers"},
            {"compare from both ends", "two-pointers"},
            {"longest stretch under a cap", "sliding-window"},
            {"no repeats in a stretch", "sliding-window"},
            {"the sum of every window of k", "sliding-window"},
            {"the next greater value", "monotonic-stack"},
            {"largest rectangle in bars", "monotonic-stack"},
            {"the maximum of every window", "monotonic-queue"},
        });
        MAP.put("Intervals", new String[][] {
            {"overlapping intervals", "merge-intervals"},
            {"fit a new interval in", "merge-intervals"},
            {"the most open at once", "sweep-line"},
            {"the outline of buildings", "sweep-line"},
        });
        MAP.put("Linked list tricks", new String[][] {
            {"the middle of a list", "fast-slow-pointers"},
            {"k-th node from the end", "fast-slow-pointers"},
            {"does the list loop back?", "floyd-cycle"},
            {"where the loop begins", "floyd-cycle"},
            {"two sorted lists into one", "merge-sorted-lists"},
            {"reverse every k nodes", "reverse-k-group"},
            {"reverse part of a list", "reverse-k-group"},
        });
        MAP.put("Heap patterns", new String[][] {
            {"the k largest", "top-k"},
            {"only k fit in memory", "top-k"},
            {"the k-th smallest value", "top-k"},
            {"merge k sorted lists", "k-way-merge"},
            {"a running median", "two-heaps-median"},
            {"a low half and a high half", "two-heaps-median"},
        });
        MAP.put("Search templates", new String[][] {
            {"find x in a sorted array", "binary-search"},
            {"the first index that works", "binary-search"},
            {"the smallest k that works", "binary-search-answer"},
            {"make the smallest gap large", "binary-search-answer"},
            {"fewest moves between states", "state-space-bfs"},
            {"a puzzle with legal moves", "state-space-bfs"},
            {"list every subset", "backtracking"},
            {"every order of n items", "backtracking"},
            {"combinations adding up to t", "combination-sum"},
            {"values may be used again", "combination-sum"},
        });
        MAP.put("Graphs", new String[][] {
            {"the cheapest route by road", "dijkstra"},
            {"a task needs others first", "topo-indegree"},
            {"do the rules go in a circle?", "topo-indegree"},
            {"are these two connected?", "disjoint-sets"},
            {"merge groups as links arrive", "disjoint-sets"},
        });
        MAP.put("Bit tricks", new String[][] {
            {"every value twice but one", "xor-tricks"},
            {"two values appear once", "xor-tricks"},
            {"a set of on/off flags", "bitmask"},
            {"count the 1 bits", "bitmask"},
        });
        MAP.put("DP patterns", new String[][] {
            {"only right or down", "dp-grid-paths"},
            {"cheapest path around walls", "dp-grid-paths"},
            {"each day: hold, sell or rest", "dp-state-machine"},
            {"a rule about the day before", "dp-state-machine"},
            {"the best order to merge a row", "dp-interval"},
            {"cost depends on neighbours", "dp-interval"},
            {"never a node with its parent", "dp-tree"},
            {"give n tasks to n workers", "dp-bitmask"},
            {"n at most about 20", "dp-bitmask"},
        });
        MAP.put("Design a data structure", new String[][] {
            {"a stack that knows its min", "min-stack"},
            {"a queue built from stacks", "two-stack-queue"},
            {"insert, delete, random: O(1)", "randomized-set"},
            {"drop the least recently used", "lru-cache"},
            {"drop the least often used", "lfu-cache"},
            {"at most r per second", "rate-limiter"},
            {"words with a given prefix", "trie"},
            {"suggest as you type", "trie"},
        });
        MAP.put("Concurrency", new String[][] {
            {"two threads, one counter", "race-condition"},
            {"a total that comes up short", "race-condition"},
            {"one thread at a time", "mutex"},
            {"at most k at once", "semaphore"},
            {"threads take turns", "semaphore"},
            {"wait while the buffer is full", "producer-consumer"},
            {"workers pull from a queue", "producer-consumer"},
            {"two locks, opposite orders", "deadlock"},
            {"both wait for ever", "deadlock"},
            {"each needs both neighbours", "dining-philosophers"},
            {"many readers or one writer", "readers-writers"},
            {"wait until all n arrive", "barrier"},
            {"no peeking at the next round", "barrier"},
            {"update without a lock", "compare-and-swap"},
            {"it changed and changed back", "compare-and-swap"},
        });
        for (String[][] cues : MAP.values())
            for (String[] cue : cues) PATTERN.put(cue[0], cue[1]);
    }

    private PatternMap() {}

    /** The pattern a cue points to, or null when the words are not a cue. */
    public static String follow(String cue) {
        return PATTERN.get(cue);
    }

    /** The family's patterns, in map order, each once. */
    public static List<String> family(String name) {
        Set<String> out = new LinkedHashSet<>();
        for (String[] cue : MAP.getOrDefault(name, new String[0][])) out.add(cue[1]);
        return new ArrayList<>(out);
    }
}
