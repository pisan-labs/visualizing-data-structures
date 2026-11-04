import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: "first n" prints the columns of the first solution (from 1), "count n" prints
 * how many solutions there are. One line in, one line out.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int n = Integer.parseInt(parts[1]);
            switch (parts[0]) {
                case "first" -> {
                    List<int[]> found = Queens.solve(n, true);
                    if (found.isEmpty()) {
                        out.append("none\n");
                    } else {
                        StringJoiner cols = new StringJoiner(" ");
                        for (int c : found.get(0)) cols.add(String.valueOf(c + 1));
                        out.append(cols).append('\n');
                    }
                }
                case "count" -> out.append(Queens.solve(n, false).size()).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
