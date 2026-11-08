import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads "multiply x y", one per line, prints the product and the number of calls. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (!p[0].equals("multiply")) continue;
            Karatsuba.calls = 0;
            long product = Karatsuba.karatsuba(Long.parseLong(p[1]), Long.parseLong(p[2]));
            out.append(product).append(' ').append(Karatsuba.calls).append('\n');
        }
        System.out.print(out);
    }
}
