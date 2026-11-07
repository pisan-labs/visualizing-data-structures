import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** A DFA with named states. delta.get(q).get(c) is where q goes on c; a missing move rejects. */
public class Dfa {
  public final List<String> states;
  public final List<String> alphabet;
  public String start;
  public final Set<String> accept;
  public final Map<String, Map<String, String>> delta;

  public Dfa(List<String> states, List<String> alphabet, String start, Set<String> accept,
      Map<String, Map<String, String>> delta) {
    this.states = new ArrayList<>(states);
    this.alphabet = new ArrayList<>(alphabet);
    this.start = start;
    this.accept = new HashSet<>(accept);
    this.delta = new HashMap<>();
    delta.forEach((q, row) -> this.delta.put(q, new HashMap<>(row)));
  }

  public String move(String q, String c) {
    return delta.getOrDefault(q, Map.of()).get(c);
  }

  public void setMove(String q, String c, String to) {
    delta.computeIfAbsent(q, k -> new HashMap<>()).put(c, to);
  }

  /** The same DFA with a dead state taking every missing move. */
  public Dfa complete() {
    String dead = "dead";
    for (int i = 2; states.contains(dead); i++) dead = "dead" + i;
    Dfa m = new Dfa(states, alphabet, start, accept, delta);
    m.states.add(dead);
    boolean missing = false;
    for (String q : m.states)
      for (String c : alphabet)
        if (m.move(q, c) == null) {
          m.setMove(q, c, dead);
          missing |= !q.equals(dead);
        }
    return missing ? m : this;
  }

  /** Complete it, then accept exactly where it did not. */
  public Dfa complement() {
    Dfa m = complete();
    Set<String> flipped = new HashSet<>(m.states);
    flipped.removeAll(m.accept);
    return new Dfa(m.states, m.alphabet, m.start, flipped, m.delta);
  }

  /** Which pairs accept, given whether p accepts in A (x) and q accepts in B (y). */
  static boolean accepts(String op, boolean x, boolean y) {
    return switch (op) {
      case "union" -> x || y;
      case "intersection" -> x && y;
      case "difference" -> x && !y;
      default -> x != y; // symmetric difference
    };
  }

  /**
   * Sipser's product construction, building only the pairs reachable from the start pair. A and
   * B read the same alphabet. The pair (p, q) is the state "p,q"; on c it goes to the pair of
   * A's move from p and B's move from q.
   */
  public static Dfa product(Dfa a, Dfa b, String op) {
    Dfa ca = a.complete();
    Dfa cb = b.complete();
    String start = ca.start + "," + cb.start;
    Dfa m = new Dfa(List.of(start), ca.alphabet, start, Set.of(), Map.of());
    ArrayDeque<String[]> queue = new ArrayDeque<>();
    queue.add(new String[] {ca.start, cb.start});
    while (!queue.isEmpty()) {
      String[] pq = queue.poll();
      for (String c : ca.alphabet) {
        String p2 = ca.move(pq[0], c);
        String q2 = cb.move(pq[1], c);
        String r = p2 + "," + q2;
        if (!m.states.contains(r)) {
          m.states.add(r);
          queue.add(new String[] {p2, q2});
        }
        m.setMove(pq[0] + "," + pq[1], c, r);
      }
    }
    for (String r : m.states) {
      String[] pq = r.split(",");
      if (accepts(op, ca.accept.contains(pq[0]), cb.accept.contains(pq[1]))) m.accept.add(r);
    }
    return m;
  }
}
