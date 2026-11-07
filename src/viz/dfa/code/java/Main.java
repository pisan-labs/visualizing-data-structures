import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    String start = null;
    List<String> accept = new ArrayList<>();
    List<String[]> moves = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "dfa" -> {
          start = null;
          accept = new ArrayList<>();
          moves = new ArrayList<>();
        }
        case "start" -> start = p[1];
        case "accept" -> accept = List.of(p).subList(1, p.length);
        case "move" -> moves.add(p);
        case "run" -> {
          Dfa m = new Dfa(start, new HashSet<>(accept));
          for (String[] mv : moves) m.addMove(mv[1], mv[2].charAt(0), mv[3]);
          String word = p.length > 1 ? p[1] : "";
          String q = m.run(word);
          out.append(m.accepts(word) ? "accept " : "reject ")
              .append(q == null ? "none" : q)
              .append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
