import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: "length x y" prints the LCS length; "lcs x y" prints the length and one LCS. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length != 3) {
                continue;
            }
            String x = parts[1];
            String y = parts[2];
            switch (parts[0]) {
                case "length" -> out.append(Lcs.table(x, y)[x.length()][y.length()]).append('\n');
                case "lcs" -> {
                    String s = Lcs.lcs(x, y);
                    out.append((s.length() + " " + s).trim()).append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}
