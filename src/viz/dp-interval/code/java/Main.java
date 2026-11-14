import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "best v1 v2 ..." prints the best total for taking the tiles; "order v1 ..."
 * prints it and the order (positions from 1); "cost s1 s2 ..." prints the least cost to merge
 * the piles; "tree s1 ..." prints it and the merges as brackets.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2) continue;
            int[] xs = new int[p.length - 1];
            for (int i = 1; i < p.length; i++) xs[i - 1] = Integer.parseInt(p[i]);
            switch (p[0]) {
                case "best" -> System.out.println(Intervals.bestRemoval(xs).best());
                case "order" -> {
                    Intervals.Removal r = Intervals.bestRemoval(xs);
                    StringBuilder out = new StringBuilder().append(r.best());
                    for (int k : r.order()) out.append(' ').append(k);
                    System.out.println(out);
                }
                case "cost" -> System.out.println(Intervals.cheapestMerge(xs).cost());
                default -> {
                    Intervals.Merging m = Intervals.cheapestMerge(xs);
                    System.out.println(m.cost() + " " + m.tree());
                }
            }
        }
    }
}
