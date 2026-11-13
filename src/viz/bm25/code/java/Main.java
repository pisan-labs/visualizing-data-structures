import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "add words" indexes a
 * document (no output); "clear" starts again; "search k1 b rsj|plus1 words" prints the best three
 * as "d<id> <score>" pairs, best first, three decimals, or "none".
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Bm25 idx = new Bm25();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "add" -> idx.add(Arrays.asList(p).subList(1, p.length));
                case "clear" -> idx = new Bm25();
                case "search" -> {
                    List<String> query = Arrays.asList(p).subList(4, p.length);
                    List<Bm25.Hit> top = idx.search(query, Double.parseDouble(p[1]), Double.parseDouble(p[2]), p[3], 3);
                    StringJoiner s = new StringJoiner(" ");
                    for (Bm25.Hit h : top) s.add("d" + h.doc() + " " + three(h.score()));
                    out.append(top.isEmpty() ? "none" : s.toString()).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
