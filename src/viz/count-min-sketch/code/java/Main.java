import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        CountMinSketch cms = null;
        int d = 0, w = 0, n = 0;
        List<Integer> seen = new ArrayList<>(); // candidates for heavy hitters
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    d = Integer.parseInt(p[1]);
                    w = Integer.parseInt(p[2]);
                    cms = new CountMinSketch(d, w);
                }
                case "add" -> {
                    int x = Integer.parseInt(p[1]);
                    cms.add(x);
                    n++;
                    if (!seen.contains(x)) seen.add(x);
                    StringBuilder row = new StringBuilder();
                    for (int i = 0; i < cms.rows(); i++) row.append(i > 0 ? " " : "").append(cms.column(i, x));
                    out.append(row).append('\n');
                }
                case "estimate" -> out.append(cms.estimate(Integer.parseInt(p[1]))).append('\n');
                case "heavy" -> {
                    StringBuilder row = new StringBuilder();
                    for (int x : cms.heavyHitters(seen, n, 20)) {
                        if (cms.estimate(x) > 0) row.append(row.length() > 0 ? " " : "").append(x);
                    }
                    out.append(row.length() > 0 ? row : "none").append('\n');
                }
                case "clear" -> {
                    cms = new CountMinSketch(d, w);
                    seen.clear();
                    n = 0;
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
