import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Toy programs that read their input and never write, and the machine D built from them.
 *
 * <p>A program is a string of instructions, numbered lines from 1: A accept, R reject, &gt; move
 * right, &lt; move left (the head stays on the end cell, or on cell 0), Gk goto k, Ek goto k if
 * the head is past the input, ?ck goto k if the head is on the symbol c. Running past the last
 * line rejects. A program's description is its code.
 */
public final class Halting {
  public static final int CAP = 1000;

  /** One line: op is one of A R &lt; &gt; G E ?; sym is the symbol ? tests; to the target. */
  public record Line(char op, char sym, int to) {}

  /** How a run ended: accept or reject after a steps, loop (a = first, b = again), unknown. */
  public record Result(String outcome, int a, int b) {
    @Override
    public String toString() {
      return switch (outcome) {
        case "loop" -> "loop " + a + " " + b;
        case "unknown" -> "unknown";
        default -> outcome + " " + a;
      };
    }
  }

  private Halting() {}

  public static List<Line> parse(String code) {
    List<Line> prog = new ArrayList<>();
    int k = 0;
    while (k < code.length()) {
      char op = code.charAt(k);
      switch (op) {
        case 'A', 'R', '<', '>' -> {
          prog.add(new Line(op, ' ', 0));
          k += 1;
        }
        case 'G', 'E' -> {
          prog.add(new Line(op, ' ', code.charAt(k + 1) - '0'));
          k += 2;
        }
        case '?' -> {
          prog.add(new Line(op, code.charAt(k + 1), code.charAt(k + 2) - '0'));
          k += 3;
        }
        default -> throw new IllegalArgumentException(op + " at " + k + " is not an instruction");
      }
    }
    return prog;
  }

  /**
   * Run a program on a word, one line per step. The program never writes, so (line, head) is
   * its whole configuration: a repeat means it does the same thing again, forever.
   */
  public static Result run(String code, String word) {
    List<Line> prog = parse(code);
    int m = word.length();
    int line = 1;
    int head = 0;
    Map<Integer, Integer> seen = new HashMap<>();
    for (int step = 1; step <= CAP; step++) {
      if (line > prog.size()) return new Result("reject", step - 1, 0);
      int config = line * (m + 1) + head;
      Integer first = seen.get(config);
      if (first != null) return new Result("loop", first, step);
      seen.put(config, step);
      Line ins = prog.get(line - 1);
      char op = ins.op();
      if (op == 'A') return new Result("accept", step, 0);
      if (op == 'R') return new Result("reject", step, 0);
      if (op == '>') head = Math.min(m, head + 1);
      if (op == '<') head = Math.max(0, head - 1);
      boolean jump =
          op == 'G'
              || (op == 'E' && head == m)
              || (op == '?' && head < m && word.charAt(head) == ins.sym());
      line = jump ? ins.to() : line + 1;
    }
    return new Result("unknown", CAP, 0);
  }

  public static boolean halts(String code, String word) {
    String o = run(code, word).outcome();
    return o.equals("accept") || o.equals("reject");
  }

  public static boolean accepts(String code, String word) {
    return run(code, word).outcome().equals("accept");
  }

  /** D's entry on each program's own code: the opposite of what the program does. */
  public static List<String> dRow(List<String> codes, String problem) {
    List<String> row = new ArrayList<>();
    for (String c : codes) {
      if (problem.equals("atm")) row.add(accepts(c, c) ? "rej" : "acc");
      else row.add(halts(c, c) ? "loop" : "halt");
    }
    return row;
  }

  /** M': the same program with every reject line turned into accept. */
  public static String acceptOnHalt(String code) {
    StringBuilder out = new StringBuilder();
    for (Line ins : parse(code)) {
      out.append(ins.op() == 'R' ? 'A' : ins.op());
      if (ins.op() == '?') out.append(ins.sym());
      if (ins.to() > 0) out.append(ins.to());
    }
    return out.toString();
  }

  /** S from a halting decider: a loop is rejected unrun; anything else is run. */
  public static String sDecidesAtm(String code, String word) {
    if (!halts(code, word)) return "reject";
    return run(code, word).outcome();
  }

  /** R from an acceptance decider: M halts on w exactly when M' accepts w. */
  public static String rDecidesHalt(String code, String word) {
    return accepts(acceptOnHalt(code), word) ? "halts" : "loops";
  }
}
