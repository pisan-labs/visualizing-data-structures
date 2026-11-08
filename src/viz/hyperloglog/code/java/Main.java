import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        HyperLogLog hll = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> hll = new HyperLogLog(Integer.parseInt(p[1]));
                case "add" -> {
                    int[] r = hll.add(Integer.parseInt(p[1]));
                    out.append(r[0]).append(' ').append(r[1]).append('\n');
                }
                case "estimate" -> out.append((long) Math.floor(hll.estimate() + 0.5)).append('\n');
                case "clear" -> {
                    hll = new HyperLogLog(hll.indexBits());
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
