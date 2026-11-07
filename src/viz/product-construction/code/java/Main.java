import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;
import java.util.TreeSet;

/**
 * Test driver: reads one operation per line, prints one result per line. Each "dfa <states>"
 * line starts a machine: the first is A, the next B, then A again.
 */
public class Main {
  static String orDash(StringJoiner j) {
    return j.length() > 0 ? j.toString() : "-";
  }

  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    Dfa[] machines = new Dfa[2];
    int which = 1;
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      List<String> rest = List.of(p).subList(1, p.length);
      Dfa m = machines[which];
      switch (p[0]) {
        case "dfa" -> {
          which = 1 - which;
          machines[which] = new Dfa(rest, List.of(), null, Set.of(), Map.of());
        }
        case "alphabet" -> m.alphabet.addAll(rest);
        case "start" -> m.start = p[1];
        case "accept" -> m.accept.addAll(rest);
        case "move" -> m.setMove(p[1], p[2], p[3]);
        case "complement" -> {
          int i = p[1].equals("A") ? 0 : 1;
          machines[i] = machines[i].complement();
          StringJoiner acc = new StringJoiner(" ");
          for (String q : new TreeSet<>(machines[i].accept)) acc.add(q);
          out.append("states ").append(machines[i].states.size()).append(" | accept ")
              .append(orDash(acc)).append('\n');
        }
        case "build" -> {
          Dfa d = Dfa.product(machines[0], machines[1], p[1]);
          StringJoiner acc = new StringJoiner(" ");
          StringJoiner moves = new StringJoiner(" ");
          for (String r : d.states) {
            if (d.accept.contains(r)) acc.add(r);
            for (String c : d.alphabet) moves.add(r + "-" + c + "->" + d.move(r, c));
          }
          out.append(String.join(" ", d.states)).append(" | accept ").append(orDash(acc))
              .append(" | ").append(orDash(moves)).append('\n');
        }
        case "run" -> {
          Dfa d = Dfa.product(machines[0], machines[1], p[1]);
          String r = d.start;
          String word = p.length > 2 ? p[2] : "";
          for (char c : word.toCharArray()) r = d.move(r, String.valueOf(c));
          out.append(d.accept.contains(r) ? "accept " : "reject ").append(r).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
