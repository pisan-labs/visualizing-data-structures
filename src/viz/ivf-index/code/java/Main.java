import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "points x y x y ..."
 * sets the points (no output). "train i1 ... ik" runs k-means from the points k-means++ chose
 * and prints the centres and the lists ("-" for an empty list). "search x y k nprobe" prints
 * the indices found and the distances computed. Three decimals.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String ids(int[] xs) {
        if (xs.length == 0) return "-";
        StringJoiner out = new StringJoiner(" ");
        for (int x : xs) out.add(String.valueOf(x));
        return out.toString();
    }

    static String ids(List<Integer> xs) {
        return ids(xs.stream().mapToInt(Integer::intValue).toArray());
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        double[][] points = new double[0][];
        Ivf index = null;
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "points" -> {
                    points = new double[(p.length - 1) / 2][];
                    for (int i = 0; i < points.length; i++)
                        points[i] = new double[] {Double.parseDouble(p[1 + 2 * i]), Double.parseDouble(p[2 + 2 * i])};
                    index = null;
                }
                case "train" -> {
                    double[][] start = new double[p.length - 1][];
                    for (int j = 0; j < start.length; j++) start[j] = points[Integer.parseInt(p[1 + j])];
                    double[][] centres = Ivf.kmeans(points, start, 20);
                    index = new Ivf(points, centres);
                    StringJoiner cs = new StringJoiner(" / ");
                    for (double[] c : centres) cs.add(three(c[0]) + " " + three(c[1]));
                    StringJoiner ls = new StringJoiner(" / ");
                    for (List<Integer> l : index.lists) ls.add(ids(l));
                    out.append(cs).append(" | ").append(ls).append('\n');
                }
                case "search" -> {
                    double[] q = {Double.parseDouble(p[1]), Double.parseDouble(p[2])};
                    Ivf.Result r = index.search(q, Integer.parseInt(p[3]), Integer.parseInt(p[4]));
                    out.append(ids(r.ids())).append(" | ").append(r.distances()).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
