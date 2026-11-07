import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sipser's subset construction, breadth first from the start set. NFA states are 0..n-1 and a
 * set of them is a bit mask: bit q is set when q is in the set.
 */
public class Subsets {
  /** The DFA's states, as sets of NFA states, in the order they are found. */
  public final List<Integer> sets = new ArrayList<>();
  /** delta.get(i)[c] is the index of the state set i goes to on symbol c. */
  public final List<int[]> delta = new ArrayList<>();
  /** accepts.get(i) is true when set i holds an accept state of the NFA. */
  public final List<Boolean> accepts = new ArrayList<>();

  /**
   * moves[q][c] lists the states q goes to on symbol c, and eps[q] the states its ε-moves
   * reach. accept is the set of accept states.
   */
  public Subsets(int[][][] moves, int[][] eps, int symbols, int start, int accept) {
    Map<Integer, Integer> index = new HashMap<>();
    ArrayDeque<Integer> queue = new ArrayDeque<>();
    int first = closure(eps, 1 << start);
    index.put(first, 0);
    sets.add(first);
    queue.add(first);
    while (!queue.isEmpty()) {
      int t = queue.poll();
      int[] row = new int[symbols];
      for (int c = 0; c < symbols; c++) {
        int m = 0;
        for (int q = 0; q < moves.length; q++)
          if ((t >> q & 1) == 1) for (int r : moves[q][c]) m |= 1 << r;
        int u = closure(eps, m);
        Integer i = index.get(u);
        if (i == null) {
          i = sets.size();
          index.put(u, i);
          sets.add(u);
          queue.add(u);
        }
        row[c] = i;
      }
      delta.add(row);
    }
    for (int set : sets) accepts.add((set & accept) != 0);
  }

  /** The ε-closure: the set, plus every state its ε-moves reach. */
  static int closure(int[][] eps, int set) {
    ArrayDeque<Integer> stack = new ArrayDeque<>();
    for (int q = 0; q < eps.length; q++) if ((set >> q & 1) == 1) stack.push(q);
    while (!stack.isEmpty()) {
      for (int r : eps[stack.pop()]) {
        if ((set >> r & 1) == 0) {
          set |= 1 << r;
          stack.push(r);
        }
      }
    }
    return set;
  }
}
