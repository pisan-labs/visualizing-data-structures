import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A pushdown automaton (Sipser), run by a breadth-first search over configurations. A move reads
 * a symbol or nothing, pops a symbol or nothing, and pushes a string whose first symbol ends up
 * on top. Stacks are strings, top first.
 */
class Pda {
  static final char EPS = 0; // read nothing or pop nothing
  static final int CAP = 200; // the search gives up after this many configurations

  record Move(String from, char read, char pop, String to, String push) {}

  record Config(String state, int read, String stack) {}

  private final String start;
  private final Set<String> accept;
  private final List<Move> moves;
  private final String stack; // what the stack holds at the start
  private final boolean byEmptyStack;

  Pda(String start, Set<String> accept, List<Move> moves, String stack, boolean byEmptyStack) {
    this.start = start;
    this.accept = accept;
    this.moves = moves;
    this.stack = stack;
    this.byEmptyStack = byEmptyStack;
  }

  private boolean accepting(Config c, String word) {
    if (c.read() < word.length()) return false;
    return byEmptyStack ? c.stack().isEmpty() : accept.contains(c.state());
  }

  private boolean fits(Move m, Config c, String word) {
    if (!m.from().equals(c.state())) return false;
    if (m.read() != EPS && (c.read() == word.length() || word.charAt(c.read()) != m.read()))
      return false;
    return m.pop() == EPS || (!c.stack().isEmpty() && c.stack().charAt(0) == m.pop());
  }

  private Config apply(Move m, Config c) {
    String rest = m.pop() == EPS ? c.stack() : c.stack().substring(1);
    return new Config(m.to(), c.read() + (m.read() == EPS ? 0 : 1), m.push() + rest);
  }

  /**
   * The moves of a shortest accepting computation, -1 when every branch dies (reject), or -2 when
   * the search reaches CAP configurations first (stopped).
   */
  int run(String word) {
    Config first = new Config(start, 0, stack);
    if (accepting(first, word)) return 0;
    Map<Config, Integer> depth = new HashMap<>(); // every configuration seen, with its moves
    depth.put(first, 0);
    ArrayDeque<Config> queue = new ArrayDeque<>(List.of(first));
    while (!queue.isEmpty()) {
      Config c = queue.poll();
      for (Move m : moves) {
        if (!fits(m, c, word)) continue;
        Config next = apply(m, c);
        if (depth.containsKey(next)) continue; // seen before: a loop of moves ends here
        if (depth.size() == CAP) return -2;
        depth.put(next, depth.get(c) + 1);
        if (accepting(next, word)) return depth.get(next);
        queue.add(next);
      }
    }
    return -1;
  }
}
