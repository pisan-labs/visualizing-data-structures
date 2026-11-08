import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

/**
 * Test driver: reads "sample k x1 ... xn | j(k+1) ... jn", one per line: the reservoir size, the
 * stream, then the random draws for the items after the first k. Prints the reservoir.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (!p[0].equals("sample")) continue;
            int k = Integer.parseInt(p[1]);
            List<String> words = Arrays.asList(p);
            int bar = words.indexOf("|");
            Iterator<String> draws = words.subList(bar + 1, p.length).iterator();
            List<String> kept = Reservoir.sample(words.subList(2, bar), k, (lo, hi) -> {
                int j = Integer.parseInt(draws.next());
                if (j < lo || j > hi) throw new IllegalStateException("draw out of range");
                return j;
            });
            out.append(String.join(" ", kept)).append('\n');
        }
        System.out.print(out);
    }
}
