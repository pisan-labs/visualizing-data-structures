import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads "pow a b m", one per line, prints a^b mod m. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (!p[0].equals("pow")) continue;
            long a = Long.parseLong(p[1]);
            long b = Long.parseLong(p[2]);
            long m = Long.parseLong(p[3]);
            out.append(ModPow.modPow(a, b, m)).append('\n');
        }
        System.out.print(out);
    }
}
