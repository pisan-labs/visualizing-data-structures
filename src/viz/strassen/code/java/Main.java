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
      if (!p[0].equals("multiply")) continue;
      int n = Integer.parseInt(p[1]);
      int[][] a = new int[n][n], b = new int[n][n];
      for (int i = 0; i < n * n; i++) {
        a[i / n][i % n] = Integer.parseInt(p[2 + i]);
        b[i / n][i % n] = Integer.parseInt(p[2 + n * n + i]);
      }
      Strassen s = new Strassen();
      int[][] c = s.multiply(a, b);
      StringJoiner rows = new StringJoiner("; ");
      for (int[] row : c) {
        StringJoiner r = new StringJoiner(" ");
        for (int x : row) r.add(String.valueOf(x));
        rows.add(r.toString());
      }
      out.append(rows).append(" | ").append(s.mults).append(' ').append(s.adds).append('\n');
    }
    System.out.print(out);
  }
}
