import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;

/**
 * Test driver: "select s1-f1 s2-f2 ..." prints how many activities earliest finish first
 * chooses, then their numbers in the order chosen.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2 || !p[0].equals("select")) {
                continue;
            }
            int n = p.length - 1;
            int[] start = new int[n];
            int[] finish = new int[n];
            for (int k = 0; k < n; k++) {
                String[] sf = p[k + 1].split("-");
                start[k] = Integer.parseInt(sf[0]);
                finish[k] = Integer.parseInt(sf[1]);
            }
            List<Integer> chosen = ActivitySelection.select(start, finish);
            out.append(chosen.size());
            for (int k : chosen) {
                out.append(' ').append(k);
            }
            out.append('\n');
        }
        System.out.print(out);
    }
}
