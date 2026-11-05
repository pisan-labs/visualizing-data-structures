import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            int a = Integer.parseInt(p[1]);
            int b = Integer.parseInt(p[2]);
            int d = Integer.parseInt(p[3]);
            switch (p[0]) {
                case "case" -> out.append(Master.masterCase(a, b, d, Integer.parseInt(p[4])));
                case "T" -> out.append(Master.T(a, b, d, Long.parseLong(p[4])));
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
            out.append('\n');
        }
        System.out.print(out);
    }
}
