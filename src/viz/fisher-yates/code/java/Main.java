import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.Iterator;

/**
 * Test driver: reads "shuffle x1 ... xn | j1 j2 ...", one per line: the values, then the random
 * picks to use in order. Prints the shuffled values.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (!p[0].equals("shuffle")) continue;
            int bar = Arrays.asList(p).indexOf("|");
            String[] values = Arrays.copyOfRange(p, 1, bar);
            Iterator<String> picks = Arrays.asList(p).subList(bar + 1, p.length).iterator();
            Shuffle.shuffle(values, (lo, hi) -> {
                int j = Integer.parseInt(picks.next());
                if (j < lo || j > hi) throw new IllegalStateException("pick out of range");
                return j;
            });
            out.append(String.join(" ", values)).append('\n');
        }
        System.out.print(out);
    }
}
