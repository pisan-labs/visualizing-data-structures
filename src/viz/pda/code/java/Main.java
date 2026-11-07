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
    String stack = "";
    boolean byStack = false;
    List<Pda.Move> moves = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "pda" -> {
          start = null;
          accept = new ArrayList<>();
          stack = "";
          byStack = false;
          moves = new ArrayList<>();
        }
        case "start" -> start = p[1];
        case "accept" -> accept = List.of(p).subList(1, p.length);
        case "stack" -> stack = String.join("", List.of(p).subList(1, p.length));
        case "by" -> byStack = p[1].equals("stack");
        case "move" -> {
          char read = p[2].equals("eps") ? Pda.EPS : p[2].charAt(0);
          char pop = p[3].equals("eps") ? Pda.EPS : p[3].charAt(0);
          String push = p[5].equals("eps") ? "" : p[5];
          moves.add(new Pda.Move(p[1], read, pop, p[4], push));
        }
        case "run" -> {
          Pda m = new Pda(start, new HashSet<>(accept), moves, stack, byStack);
          int k = m.run(p.length > 1 ? p[1] : "");
          out.append(k >= 0 ? "accept " + k : k == -1 ? "reject" : "stopped").append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}
