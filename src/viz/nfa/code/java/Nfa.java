import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * A nondeterministic finite automaton with epsilon-moves (Sipser). The machine is in a set of
 * states at once, and it accepts when that set holds an accept state after the whole word.
 */
class Nfa {
  static final char EPS = 0; // the symbol of an epsilon-move

  private final String start;
  private final Set<String> accept;
  private final Map<String, Map<Character, Set<String>>> delta = new HashMap<>();

  Nfa(String start, Set<String> accept) {
    this.start = start;
    this.accept = accept;
  }

  void addMove(String from, char symbol, String to) {
    delta.computeIfAbsent(from, k -> new HashMap<>())
        .computeIfAbsent(symbol, k -> new HashSet<>())
        .add(to);
  }

  private Set<String> targets(String q, char c) {
    return delta.getOrDefault(q, Map.of()).getOrDefault(c, Set.of());
  }

  /** E(S): the states, and every state their epsilon-moves reach. */
  Set<String> closure(Set<String> states) {
    Set<String> seen = new HashSet<>(states);
    Deque<String> todo = new ArrayDeque<>(states);
    while (!todo.isEmpty()) {
      for (String r : targets(todo.pop(), EPS)) {
        if (seen.add(r)) todo.push(r); // an epsilon-loop stops here
      }
    }
    return seen;
  }

  /** The set of states the machine is in after reading the word. */
  Set<String> run(String word) {
    Set<String> current = closure(Set.of(start));
    for (char c : word.toCharArray()) {
      Set<String> moved = new HashSet<>();
      for (String q : current) moved.addAll(targets(q, c));
      current = closure(moved);
      if (current.isEmpty()) break; // every branch has died
    }
    return current;
  }

  boolean accepts(String word) {
    for (String q : run(word)) if (accept.contains(q)) return true;
    return false;
  }
}
