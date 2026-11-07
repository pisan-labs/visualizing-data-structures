import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;

/**
 * Test driver: one command per line, one line of output per command.
 *
 * <pre>
 *   run &lt;program&gt; &lt;input&gt;               accept &lt;steps&gt; | reject &lt;steps&gt; | loop &lt;first&gt; &lt;again&gt;
 *   diagonal &lt;atm|halt&gt; &lt;p1&gt; ... &lt;pn&gt;   D: &lt;D's entry for each program&gt;
 *   reduce &lt;atm|halt&gt; &lt;program&gt; &lt;input&gt; S: accept|reject, or R: halts|loops
 * </pre>
 */
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "run" -> out.append(Halting.run(p[1], p[2])).append('\n');
        case "diagonal" -> {
          var row = Halting.dRow(Arrays.asList(p).subList(2, p.length), p[1]);
          out.append("D: ").append(String.join(" ", row)).append('\n');
        }
        case "reduce" -> {
          if (p[1].equals("atm")) out.append("S: ").append(Halting.sDecidesAtm(p[2], p[3]));
          else out.append("R: ").append(Halting.rDecidesHalt(p[2], p[3]));
          out.append('\n');
        }
        default -> {}
      }
    }
    System.out.print(out);
  }
}
