import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. "dfa <states>" starts
 * a DFA (states in name order, the order they are ripped in), then "alphabet", "start",
 * "accept" and "move p c q" lines. "convert" prints the expression.
 */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in =
        new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
    List<String> states = new ArrayList<>();
    List<String> accept = new ArrayList<>();
    List<String[]> moves = new ArrayList<>();
    String start = null;
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      List<String> rest = List.of(p).subList(1, p.length);
      switch (p[0]) {
        case "dfa" -> {
          states = rest;
          accept = new ArrayList<>();
          moves = new ArrayList<>();
        }
        case "start" -> start = p[1];
        case "accept" -> accept = rest;
        case "move" -> moves.add(new String[] {p[1], p[2], p[3]});
        case "convert" -> out.println(StateElimination.toRegex(states, start, accept, moves));
        default -> { }
      }
    }
  }
}
