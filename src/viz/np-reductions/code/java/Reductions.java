import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Polynomial-time reductions. None of them solves anything: each one only builds a new
 * instance whose answer is the same as the old one's.
 */
public class Reductions {
  /** An undirected graph and the k the question asks about. */
  public record Graph(List<String> vertices, List<String[]> edges, int k) {}

  /** A set cover instance: the universe 1..m, a set per name, and k. */
  public record Cover(int m, Map<String, List<Integer>> sets, int k) {}

  /**
   * 3-SAT to INDEPENDENT-SET. A clause is a list of literals such as "a" or "!b". One vertex
   * per literal ("!b2" is the !b of clause 2), joined within a clause, and every x joined to
   * every !x in another clause. k = number of clauses.
   */
  public static Graph satToIs(List<List<String>> clauses) {
    List<String> vertices = new ArrayList<>();
    List<String[]> edges = new ArrayList<>();
    List<List<String>> names = new ArrayList<>();
    for (int j = 0; j < clauses.size(); j++) {
      List<String> vs = new ArrayList<>();
      for (String lit : clauses.get(j)) vs.add(lit + (j + 1));
      names.add(vs);
      vertices.addAll(vs);
      for (int a = 0; a < vs.size(); a++)
        for (int b = a + 1; b < vs.size(); b++) edges.add(new String[] {vs.get(a), vs.get(b)});
    }
    for (int i = 0; i < clauses.size(); i++)
      for (int j = i + 1; j < clauses.size(); j++)
        for (int a = 0; a < clauses.get(i).size(); a++)
          for (int b = 0; b < clauses.get(j).size(); b++)
            if (opposite(clauses.get(i).get(a), clauses.get(j).get(b)))
              edges.add(new String[] {names.get(i).get(a), names.get(j).get(b)});
    return new Graph(vertices, edges, clauses.size());
  }

  static boolean opposite(String x, String y) {
    return !x.equals(y) && x.replace("!", "").equals(y.replace("!", ""));
  }

  /** Every pair of vertices that is not an edge. */
  static List<String[]> complement(List<String> vs, List<String[]> edges) {
    Set<String> joined = new HashSet<>();
    for (String[] e : edges) {
      joined.add(e[0] + " " + e[1]);
      joined.add(e[1] + " " + e[0]);
    }
    List<String[]> out = new ArrayList<>();
    for (int i = 0; i < vs.size(); i++)
      for (int j = i + 1; j < vs.size(); j++)
        if (!joined.contains(vs.get(i) + " " + vs.get(j)))
          out.add(new String[] {vs.get(i), vs.get(j)});
    return out;
  }

  /** S is independent exactly when V - S touches every edge. */
  public static Graph isToVc(Graph g) {
    return new Graph(g.vertices(), g.edges(), g.vertices().size() - g.k());
  }

  /** S is independent in G exactly when S is a clique in the complement. */
  public static Graph isToClique(Graph g) {
    return new Graph(g.vertices(), complement(g.vertices(), g.edges()), g.k());
  }

  /** S is a clique in G exactly when V - S covers the complement. */
  public static Graph cliqueToVc(Graph g) {
    return new Graph(
        g.vertices(), complement(g.vertices(), g.edges()), g.vertices().size() - g.k());
  }

  /** One element per edge (numbered from 1), one set per vertex: the edges it touches. */
  public static Cover vcToSc(Graph g) {
    Map<String, List<Integer>> sets = new LinkedHashMap<>();
    for (String v : g.vertices()) {
      List<Integer> items = new ArrayList<>();
      for (int i = 0; i < g.edges().size(); i++) {
        String[] e = g.edges().get(i);
        if (e[0].equals(v) || e[1].equals(v)) items.add(i + 1);
      }
      sets.put(v, items);
    }
    return new Cover(g.edges().size(), sets, g.k());
  }
}
