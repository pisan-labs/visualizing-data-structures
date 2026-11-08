import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashSet;
import java.util.Set;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        BloomFilter bloom = null;
        Set<Integer> inserted = new HashSet<>(); // only to measure false positives
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> bloom = new BloomFilter(Integer.parseInt(p[1]), Integer.parseInt(p[2]));
                case "insert" -> {
                    int x = Integer.parseInt(p[1]);
                    bloom.insert(x);
                    inserted.add(x);
                    StringBuilder row = new StringBuilder();
                    for (int j : bloom.positions(x)) row.append(row.length() > 0 ? " " : "").append(j);
                    out.append(row).append('\n');
                }
                case "query" -> out.append(bloom.query(Integer.parseInt(p[1])) ? "maybe\n" : "no\n");
                case "delete" -> out.append("unsupported\n");
                case "measure" -> {
                    int fp = 0, absent = 0;
                    for (int x = 0; x < 1000; x++) {
                        if (inserted.contains(x)) continue;
                        absent++;
                        if (bloom.query(x)) fp++;
                    }
                    out.append(fp).append(' ').append(absent).append('\n');
                }
                case "clear" -> {
                    bloom.clear();
                    inserted.clear();
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
