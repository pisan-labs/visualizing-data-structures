import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "ship d w1 w2 ..." prints the smallest capacity that ships the weights in d
 * days; "spread k p1 p2 ..." prints the largest gap k items can keep on the positions.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 3) continue;
            int n = Integer.parseInt(p[1]);
            int[] values = new int[p.length - 2];
            for (int i = 2; i < p.length; i++) values[i - 2] = Integer.parseInt(p[i]);
            switch (p[0]) {
                case "ship" -> System.out.println(SearchAnswer.smallestCapacity(values, n));
                case "spread" -> System.out.println(SearchAnswer.largestGap(values, n));
                default -> {}
            }
        }
    }
}
