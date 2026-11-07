import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * Test driver: reads one move per line, prints one result per line.
 *   adversary <lemma> <lang> <p> <s>        -> splits <n> survive <k> pick <lengths>
 *   pump <lemma> <lang> <s> <lengths> <i>   -> <pumped string or eps> in|out
 *   prover <lemma> <lang> <s> <lengths>     -> i <i> | none
 */
public class Main {
    static int[] ints(String[] a, int from, int to) {
        return Arrays.stream(a, from, to).mapToInt(Integer::parseInt).toArray();
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        for (String line; (line = in.readLine()) != null; ) {
            String[] a = line.trim().split("\\s+");
            if (a.length < 2) continue;
            boolean regular = a[1].equals("regular");
            switch (a[0]) {
                case "adversary" -> {
                    Pumping.Search r = Pumping.adversary(a[2], a[4], Integer.parseInt(a[3]), regular);
                    String pick = Arrays.stream(r.pick()).mapToObj(String::valueOf)
                            .collect(Collectors.joining(" "));
                    out.append("splits ").append(r.count()).append(" survive ")
                            .append(r.survivors()).append(" pick ").append(pick).append('\n');
                }
                case "pump" -> {
                    int[] parts = ints(a, 4, a.length - 1);
                    int i = Integer.parseInt(a[a.length - 1]);
                    String w = Pumping.pump(a[3], parts, i, regular);
                    boolean inL = Pumping.member(a[2]).test(w);
                    out.append(w.isEmpty() ? "eps" : w).append(inL ? " in" : " out").append('\n');
                }
                case "prover" -> {
                    int i = Pumping.prover(a[2], a[3], ints(a, 4, a.length), regular);
                    out.append(i < 0 ? "none" : "i " + i).append('\n');
                }
                default -> throw new IllegalArgumentException(a[0]);
            }
        }
        System.out.print(out);
    }
}
