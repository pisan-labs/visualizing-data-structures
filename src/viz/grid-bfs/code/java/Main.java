import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws IOException {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] parts = line.trim().split("\\s+");
      if (!parts[0].equals("bfs")) continue;
      String[] grid = Arrays.copyOfRange(parts, 2, parts.length);
      int cols = grid[0].length();
      GridBfs b = new GridBfs(grid, parts[1].equals("8"));
      if (b.path.isEmpty()) {
        out.append("none ").append(b.expanded).append('\n');
        continue;
      }
      out.append(b.path.size() - 1).append(' ').append(b.expanded);
      for (int k : b.path) out.append(' ').append((char) ('A' + k % cols)).append(k / cols + 1);
      out.append('\n');
    }
    System.out.print(out);
  }
}
