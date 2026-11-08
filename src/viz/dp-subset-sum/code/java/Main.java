import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;

/**
 * Test driver: "can T x1 x2 ..." prints true or false; "subset T x1 x2 ..." prints true and the
 * numbers of a subset that adds up to T, or false.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2) {
                continue;
            }
            int target = Integer.parseInt(p[1]);
            int[] xs = new int[p.length - 2];
            for (int k = 0; k < xs.length; k++) {
                xs[k] = Integer.parseInt(p[k + 2]);
            }
            List<Integer> found = SubsetSum.subset(xs, target);
            switch (p[0]) {
                case "can" -> out.append(found != null).append('\n');
                case "subset" -> {
                    out.append(found != null);
                    if (found != null) {
                        for (int x : found) {
                            out.append(' ').append(x);
                        }
                    }
                    out.append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}
