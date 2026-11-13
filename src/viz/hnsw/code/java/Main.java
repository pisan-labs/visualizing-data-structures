import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "m M" starts an empty
 * graph. "insert x y level" inserts a point at a given level and prints the distances computed,
 * a bar, and its links on each layer from the top down ("-" for none). "search x y k ef" prints
 * the ids found and the distances computed.
 */
public class Main {
    static String ids(List<Integer> xs) {
        if (xs.isEmpty()) return "-";
        StringJoiner out = new StringJoiner(" ");
        for (int x : xs) out.add(String.valueOf(x));
        return out.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Hnsw g = new Hnsw(2, 4);
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "m" -> g = new Hnsw(Integer.parseInt(p[1]), 4);
                case "insert" -> {
                    int[] q = {Integer.parseInt(p[1]), Integer.parseInt(p[2])};
                    int id = g.insert(q, Integer.parseInt(p[3]));
                    StringJoiner layers = new StringJoiner(" / ");
                    List<List<Integer>> own = g.links.get(id);
                    for (int l = own.size() - 1; l >= 0; l--) layers.add(ids(own.get(l)));
                    out.append(g.distances).append(" | ").append(layers).append('\n');
                }
                case "search" -> {
                    int[] q = {Integer.parseInt(p[1]), Integer.parseInt(p[2])};
                    List<Integer> found = g.search(q, Integer.parseInt(p[3]), Integer.parseInt(p[4]));
                    out.append(ids(found)).append(" | ").append(g.distances).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
