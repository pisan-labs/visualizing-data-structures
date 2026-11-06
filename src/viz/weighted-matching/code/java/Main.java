import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      if (!p[0].equals("solve")) continue;
      int n = Integer.parseInt(p[2]);
      int[][] cost = new int[n][n];
      for (int k = 0; k < n * n; k++) cost[k / n][k % n] = Integer.parseInt(p[3 + k]);
      int[] mate = Hungarian.solve(cost, p[1].equals("max"));
      int total = 0;
      StringJoiner cols = new StringJoiner(" ");
      for (int i = 0; i < n; i++) {
        total += cost[i][mate[i]];
        cols.add(String.valueOf(mate[i] + 1));
      }
      out.append(total).append(" | ").append(cols).append('\n');
    }
    System.out.print(out);
  }
}
