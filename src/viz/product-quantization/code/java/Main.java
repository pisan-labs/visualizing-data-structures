import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "vectors a b c d ..."
 * sets the vectors (no output). "train m k u1 ..." trains m codebooks of k centres with those
 * k-means++ draws and prints them. "encode" prints every vector's code. "search a b c d k"
 * prints the distance to every vector by the table, then the k nearest by it. Three decimals.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String ints(int[] xs) {
        StringJoiner out = new StringJoiner(" ");
        for (int x : xs) out.add(String.valueOf(x));
        return out.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        double[][] vectors = new double[0][];
        Pq pq = null;
        int[][] codes = new int[0][];
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "vectors" -> {
                    vectors = new double[(p.length - 1) / 4][4];
                    for (int i = 0; i < vectors.length; i++)
                        for (int c = 0; c < 4; c++) vectors[i][c] = Double.parseDouble(p[1 + 4 * i + c]);
                }
                case "train" -> {
                    pq = new Pq(Integer.parseInt(p[1]), Integer.parseInt(p[2]));
                    double[] draws = new double[p.length - 3];
                    for (int i = 0; i < draws.length; i++) draws[i] = Double.parseDouble(p[3 + i]);
                    pq.train(vectors, draws);
                    StringJoiner books = new StringJoiner(" | ");
                    for (double[][] book : pq.books) {
                        StringJoiner cs = new StringJoiner(" / ");
                        for (double[] c : book) {
                            StringJoiner xs = new StringJoiner(" ");
                            for (double x : c) xs.add(three(x));
                            cs.add(xs.toString());
                        }
                        books.add(cs.toString());
                    }
                    out.append(books).append('\n');
                }
                case "encode" -> {
                    codes = new int[vectors.length][];
                    StringJoiner cs = new StringJoiner(" / ");
                    for (int i = 0; i < vectors.length; i++) {
                        codes[i] = pq.encode(vectors[i]);
                        cs.add(ints(codes[i]));
                    }
                    out.append(cs).append('\n');
                }
                case "search" -> {
                    double[] q = new double[4];
                    for (int c = 0; c < 4; c++) q[c] = Double.parseDouble(p[1 + c]);
                    double[] dists = pq.distances(q, codes);
                    StringJoiner ds = new StringJoiner(" ");
                    for (double d : dists) ds.add(three(d));
                    out.append(ds).append(" | ").append(ints(Pq.nearestK(dists, Integer.parseInt(p[5])))).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
