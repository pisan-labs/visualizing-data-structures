import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A graph on vertices 0..n-1. adj.get(u) holds u's neighbours in increasing order. */
class AdjacencyList {
  private final List<List<Integer>> adj = new ArrayList<>();
  private final boolean directed;

  AdjacencyList(int n, boolean directed) {
    for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    this.directed = directed;
  }

  boolean hasEdge(int u, int v) {
    for (int x : adj.get(u)) { // O(degree of u)
      if (x == v) return true;
    }
    return false;
  }

  boolean addEdge(int u, int v) {
    if (hasEdge(u, v)) return false;
    insertInOrder(adj.get(u), v);
    if (!directed) insertInOrder(adj.get(v), u);
    return true;
  }

  boolean removeEdge(int u, int v) {
    if (!hasEdge(u, v)) return false;
    adj.get(u).remove(Integer.valueOf(v));
    if (!directed) adj.get(v).remove(Integer.valueOf(u));
    return true;
  }

  List<Integer> neighbours(int u) {
    return new ArrayList<>(adj.get(u)); // O(degree of u)
  }

  private static void insertInOrder(List<Integer> list, int x) {
    int i = Collections.binarySearch(list, x);
    list.add(-(i + 1), x);
  }
}

/** A graph on vertices 0..n-1. m[u][v] is true when there is an edge u -> v. */
class AdjacencyMatrix {
  private final boolean[][] m;
  private final boolean directed;

  AdjacencyMatrix(int n, boolean directed) {
    m = new boolean[n][n]; // O(n^2) space, edges or not
    this.directed = directed;
  }

  boolean hasEdge(int u, int v) {
    return m[u][v]; // O(1)
  }

  boolean addEdge(int u, int v) {
    if (m[u][v]) return false;
    m[u][v] = true;
    if (!directed) m[v][u] = true;
    return true;
  }

  boolean removeEdge(int u, int v) {
    if (!m[u][v]) return false;
    m[u][v] = false;
    if (!directed) m[v][u] = false;
    return true;
  }

  List<Integer> neighbours(int u) {
    List<Integer> out = new ArrayList<>();
    for (int v = 0; v < m.length; v++) { // O(n)
      if (m[u][v]) out.add(v);
    }
    return out;
  }
}
