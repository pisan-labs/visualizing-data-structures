import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Moore's partition refinement. States are 0..n-1; a dead state, if one is needed, is n. */
public class Minimize {
  /** Blocks of equivalent states, in the order of their first state. */
  public final List<List<Integer>> blocks = new ArrayList<>();
  /** moves.get(i)[c] is the block that block i goes to on symbol c. */
  public final List<int[]> moves = new ArrayList<>();

  /** delta[q][c] is the state q goes to on symbol c, or -1 for a missing move. */
  public Minimize(int[][] delta, int symbols, int start, boolean[] accept) {
    int n = delta.length;
    // Complete the DFA: a dead state takes every missing move.
    boolean missing = false;
    for (int[] row : delta) for (int t : row) missing |= t < 0;
    int[][] d = new int[missing ? n + 1 : n][symbols];
    for (int q = 0; q < d.length; q++)
      for (int c = 0; c < symbols; c++) d[q][c] = q == n || delta[q][c] < 0 ? n : delta[q][c];
    // Keep only the states the start can reach.
    boolean[] seen = new boolean[d.length];
    ArrayDeque<Integer> stack = new ArrayDeque<>();
    seen[start] = true;
    stack.push(start);
    while (!stack.isEmpty())
      for (int t : d[stack.pop()])
        if (!seen[t]) {
          seen[t] = true;
          stack.push(t);
        }
    List<Integer> states = new ArrayList<>();
    for (int q = 0; q < d.length; q++) if (seen[q]) states.add(q);
    // Start from {F, Q - F}; split blocks by signature until nothing splits.
    int[] block = new int[d.length];
    for (int q : states) block[q] = q < n && accept[q] ? 1 : 0;
    for (;;) {
      Map<List<Integer>, Integer> ids = new HashMap<>();
      int[] next = new int[d.length];
      HashSet<Integer> before = new HashSet<>();
      for (int q : states) {
        before.add(block[q]);
        List<Integer> sig = new ArrayList<>();
        sig.add(block[q]);
        for (int t : d[q]) sig.add(block[t]);
        Integer id = ids.get(sig);
        if (id == null) ids.put(sig, id = ids.size());
        next[q] = id;
      }
      block = next;
      if (ids.size() == before.size()) break;
    }
    Map<Integer, List<Integer>> groups = new LinkedHashMap<>();
    for (int q : states) groups.computeIfAbsent(block[q], b -> new ArrayList<>()).add(q);
    blocks.addAll(groups.values());
    int[] index = new int[d.length];
    for (int i = 0; i < blocks.size(); i++) for (int q : blocks.get(i)) index[q] = i;
    for (List<Integer> b : blocks) {
      int[] row = new int[symbols];
      for (int c = 0; c < symbols; c++) row[c] = index[d[b.get(0)][c]];
      moves.add(row);
    }
  }
}
