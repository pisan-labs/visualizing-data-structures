import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.stream.Collectors;

/** Test driver: reads "sieve n", one per line, prints the primes up to n. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (!p[0].equals("sieve")) continue;
            List<Integer> primes = Sieve.sieve(Integer.parseInt(p[1]));
            out.append(primes.stream().map(String::valueOf).collect(Collectors.joining(" ")));
            out.append('\n');
        }
        System.out.print(out);
    }
}
