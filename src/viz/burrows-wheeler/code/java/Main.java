import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: bwt, inverse, bwtindex and inverseindex, one per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            switch (parts[0]) {
                case "bwt" -> out.append(Bwt.transform(parts[1])).append('\n');
                case "inverse" -> out.append(Bwt.inverse(parts[1])).append('\n');
                case "bwtindex" -> {
                    String[] r = Bwt.transformIndex(parts[1]);
                    out.append(r[0]).append(' ').append(r[1]).append('\n');
                }
                case "inverseindex" ->
                        out.append(Bwt.inverseIndex(parts[1], Integer.parseInt(parts[2])))
                                .append('\n');
                default -> {}
            }
        }
        System.out.print(out);
    }
}
