import java.io.*;
import java.util.*;
import java.util.function.Function;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   property accepts-A | accepts-eps | nonempty   choose P (and its M_P)
 *   build 3 2      M' from M3 and w = <M2> (programs numbered from 1)
 *   test AG        prints what M' does on the input: accept, reject or loop
 *   decide         prints whether M' has P: yes or no (it does exactly when M halts on w)
 */
public class Main {
    static final String[] PROGRAMS = {"A", "G1", "E6>E3>G1A", "?A5?G4RG4A", "?R7E5>G1<G1A", "E4>G1<?A7RA"};
    // For each property: M_P, and a word whose acceptance decides P for M'.
    static final Map<String, String[]> PROPERTIES = Map.of(
        "accepts-A", new String[] {"A", "A"},
        "accepts-eps", new String[] {"E3RA", ""},
        "nonempty", new String[] {"?A3RA", "A"});

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String[] prop = PROPERTIES.get("accepts-A");
        Function<String, String> machine = null;
        for (String line; (line = in.readLine()) != null; ) {
            String[] w = line.trim().split(" ", 2);
            switch (w[0]) {
                case "property" -> prop = PROPERTIES.get(w[1]);
                case "build" -> {
                    String[] ij = w[1].trim().split("\\s+");
                    machine = Rice.mPrime(PROGRAMS[Integer.parseInt(ij[0]) - 1], PROGRAMS[Integer.parseInt(ij[1]) - 1], prop[0]);
                }
                case "test" -> System.out.println(machine.apply(w[1].equals("eps") ? "" : w[1]));
                case "decide" -> System.out.println(Rice.hasProperty(machine, prop[1]) ? "yes" : "no");
                default -> { }
            }
        }
    }
}
