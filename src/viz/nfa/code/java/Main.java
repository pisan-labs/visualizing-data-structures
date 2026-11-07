import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    String start = null;
    List<String> order = new ArrayList<>();
    List<String> accept = new ArrayList<>();
    List<String[]> moves = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "nfa" -> {
          start = null;
          order = List.of(p).subList(1, p.length);
          accept = new ArrayList<>();
          moves = new ArrayList<>();
        }
        case "start" -> start = p[1];
        case "accept" -> accept = List.of(p).subList(1, p.length);
        case "move" -> moves.add(p);
        case "run" -> {
          Nfa m = new Nfa(start, new HashSet<>(accept));
          for (String[] mv : moves) {
            char c = mv[2].equals("eps") ? Nfa.EPS : mv[2].charAt(0);
            m.addMove(mv[1], c, mv[3]);
          }
          String word = p.length > 1 ? p[1] : "";
          Set<String> last = m.run(word);
          StringJoiner set = new StringJoiner(",", "{", "}");
          for (String q : order) if (last.contains(q)) set.add(q);
          out.append(m.accepts(word) ? "accept " : "reject ").append(set).append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
