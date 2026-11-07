// Test driver: reads one operation per line, prints one line per match.
//   nfa <states> <start> <accept>     a new NFA with no moves yet (prints nothing)
//   move <from> <symbol or eps> <to>  a move; a state's moves are tried in the order given
//   match <word, or eps>              "<backtracking answer> <steps> <simulation answer> <steps>"
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in =
        new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    StringBuilder out = new StringBuilder();
    RegexEngines nfa = null;
    String line;
    while ((line = in.readLine()) != null) {
      String[] t = line.trim().split("\\s+");
      switch (t[0]) {
        case "nfa" -> nfa =
            new RegexEngines(
                Integer.parseInt(t[1]), Integer.parseInt(t[2]), Integer.parseInt(t[3]));
        case "move" -> nfa.add(
            Integer.parseInt(t[1]),
            t[2].equals("eps") ? RegexEngines.EPS : t[2].charAt(0),
            Integer.parseInt(t[3]));
        case "match" -> {
          String word = t.length < 2 || t[1].equals("eps") ? "" : t[1];
          RegexEngines.Result b = nfa.backtrack(word);
          RegexEngines.Result s = nfa.simulate(word);
          out.append(b.answer()).append(' ').append(b.steps()).append(' ');
          out.append(s.answer()).append(' ').append(s.steps()).append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
