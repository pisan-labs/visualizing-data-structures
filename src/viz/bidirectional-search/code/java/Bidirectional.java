import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

/** Shortest path from s to t by BFS from both ends, one layer per turn. */
public class Bidirectional {
  public List<Integer> path; // null when t cannot be reached
  public int expanded;

  /** adj: out-neighbours, radj: in-neighbours (the same when undirected), in increasing order. */
  public Bidirectional(List<List<Integer>> adj, List<List<Integer>> radj, int s, int t) {
    if (s == t) {
      path = List.of(s);
      return;
    }
    List<Map<Integer, Integer>> dist = List.of(new HashMap<>(Map.of(s, 0)), new HashMap<>(Map.of(t, 0)));
    List<Map<Integer, Integer>> parent = List.of(new HashMap<>(), new HashMap<>());
    List<List<Integer>> frontier = new ArrayList<>(List.of(List.of(s), List.of(t)));
    List<List<List<Integer>>> graph = List.of(adj, radj);
    int side = 1;
    while (!frontier.get(0).isEmpty() && !frontier.get(1).isEmpty()) {
      side = 1 - side; // take turns: s side, t side, ...
      Map<Integer, Integer> mine = dist.get(side), theirs = dist.get(1 - side);
      List<Integer> layer = new ArrayList<>();
      for (int u : frontier.get(side)) {
        expanded++;
        for (int v : graph.get(side).get(u)) {
          if (mine.containsKey(v)) continue;
          mine.put(v, mine.get(u) + 1);
          parent.get(side).put(v, u);
          layer.add(v);
          if (theirs.containsKey(v)) { // the searches meet: join the halves
            LinkedList<Integer> p = new LinkedList<>(List.of(v));
            while (parent.get(0).containsKey(p.getFirst())) p.addFirst(parent.get(0).get(p.getFirst()));
            while (parent.get(1).containsKey(p.getLast())) p.addLast(parent.get(1).get(p.getLast()));
            path = p;
            return;
          }
        }
      }
      frontier.set(side, layer);
    }
  }
}
