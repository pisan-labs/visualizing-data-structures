import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "count g" prints how many paths cross the grid g (rows split by /, a digit per
 * cell, # for a wall); "cost g" prints the cheapest path's cost; "path g" prints the cost and
 * the moves (D, R). Both print "none" when walls block every path.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length != 2) continue;
            String[] grid = p[1].split("/");
            if (p[0].equals("count")) {
                System.out.println(GridPaths.countPaths(grid));
                continue;
            }
            GridPaths.Path best = GridPaths.cheapestPath(grid);
            if (best == null) System.out.println("none");
            else if (p[0].equals("cost")) System.out.println(best.cost());
            else System.out.println(best.cost() + " " + String.join(" ", best.moves().split("")));
        }
    }
}
