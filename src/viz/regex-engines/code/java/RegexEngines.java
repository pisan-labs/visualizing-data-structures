import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Two ways to match a word on the NFA that Thompson's construction builds from a regular
 * expression: backtracking (Perl, Python's re, Java, JavaScript) and NFA simulation (RE2, grep,
 * Go). Both count steps: one step is one visit to a state at a position in the word.
 */
public class RegexEngines {
  public static final char EPS = 'ε'; // the symbol of an ε-move
  public static final int CAP = 100_000; // the backtracker gives up after this many steps

  public record Result(String answer, int steps) {}

  private record Move(char symbol, int to) {}

  /** A choice left for later: a state, the symbols read, and the states passed there. */
  private record Choice(int q, int i, Set<Integer> seen) {}

  private final List<List<Move>> moves = new ArrayList<>(); // moves.get(q), in the order tried
  private final int start;
  private final int accept;

  public RegexEngines(int states, int start, int accept) {
    for (int q = 0; q < states; q++) moves.add(new ArrayList<>());
    this.start = start;
    this.accept = accept;
  }

  public void add(int p, char symbol, int q) {
    moves.get(p).add(new Move(symbol, q));
  }

  /** One path at a time, depth first. */
  public Result backtrack(String word) {
    int steps = 0;
    Deque<Choice> stack = new ArrayDeque<>();
    stack.push(new Choice(start, 0, Set.of()));
    while (!stack.isEmpty()) {
      Choice c = stack.pop();
      while (true) {
        steps++;
        if (c.q() == accept && c.i() == word.length()) return new Result("accept", steps);
        if (steps == CAP) return new Result("stopped", steps);
        Set<Integer> seen = new HashSet<>(c.seen());
        seen.add(c.q());
        List<Choice> ways = new ArrayList<>();
        for (Move m : moves.get(c.q())) {
          if (m.symbol() == EPS) {
            // An ε-loop back to a state passed here goes nowhere.
            if (!seen.contains(m.to())) ways.add(new Choice(m.to(), c.i(), seen));
          } else if (c.i() < word.length() && word.charAt(c.i()) == m.symbol()) {
            ways.add(new Choice(m.to(), c.i() + 1, Set.of()));
          }
        }
        if (ways.isEmpty()) break; // dead end: back up to the latest choice
        for (int k = ways.size() - 1; k > 0; k--) stack.push(ways.get(k)); // for later
        c = ways.get(0);
      }
    }
    return new Result("reject", steps);
  }

  /** Every path at once: the set of states the NFA could be in. */
  public Result simulate(String word) {
    Set<Integer> current = closure(Set.of(start));
    int steps = current.size();
    for (char c : word.toCharArray()) {
      if (current.isEmpty()) break;
      Set<Integer> next = new HashSet<>();
      for (int q : current) for (Move m : moves.get(q)) if (m.symbol() == c) next.add(m.to());
      current = closure(next);
      steps += current.size();
    }
    return new Result(current.contains(accept) ? "accept" : "reject", steps);
  }

  /** Every state reachable from `states` by ε-moves alone. */
  private Set<Integer> closure(Set<Integer> states) {
    Set<Integer> out = new TreeSet<>(states);
    Deque<Integer> todo = new ArrayDeque<>(states);
    while (!todo.isEmpty())
      for (Move m : moves.get(todo.pop()))
        if (m.symbol() == EPS && out.add(m.to())) todo.push(m.to());
    return out;
  }
}
