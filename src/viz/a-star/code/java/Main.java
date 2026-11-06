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
      if (!parts[0].equals("astar")) continue;
      String[] grid = Arrays.copyOfRange(parts, 4, parts.length);
      int cols = grid[0].length();
      AStar a = new AStar(grid, parts[2], Double.parseDouble(parts[3]), parts[1].equals("8"));
      if (a.path.isEmpty()) {
        out.append("none ").append(a.expanded).append('\n');
        continue;
      }
      out.append(a.path.size() - 1).append(' ').append(a.expanded);
      for (int k : a.path) out.append(' ').append((char) ('A' + k % cols)).append(k / cols + 1);
      out.append('\n');
    }
    System.out.print(out);
  }
}
