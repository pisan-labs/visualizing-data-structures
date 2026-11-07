import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * A deterministic finite automaton (Sipser): a start state q0, accept states F and a
 * transition function delta. A move may be missing; the word is then rejected.
 */
class Dfa {
  private final String start;
  private final Set<String> accept;
  private final Map<String, Map<Character, String>> delta = new HashMap<>();

  Dfa(String start, Set<String> accept) {
    this.start = start;
    this.accept = accept;
  }

  void addMove(String from, char symbol, String to) {
    delta.computeIfAbsent(from, k -> new HashMap<>()).put(symbol, to);
  }

  /** The state the machine ends in, or null if a move is missing. */
  String run(String word) {
    String q = start;
    for (char c : word.toCharArray()) {
      q = delta.getOrDefault(q, Map.of()).get(c);
      if (q == null) return null; // no move: reject
    }
    return q;
  }

  boolean accepts(String word) {
    String q = run(word);
    return q != null && accept.contains(q);
  }
}
