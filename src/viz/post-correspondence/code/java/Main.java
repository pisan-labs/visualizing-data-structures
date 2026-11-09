import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;

/**
 * Test driver: reads one operation per line, prints one result per line.
 * dominoes b/ca a/ab ... loads an instance (prints nothing); search <bound> prints "match 2 1 3
 * 2 4", "no match", "none up to 6" or "gave up"; try 2 1 3 prints "match", "dead at column 4"
 * or "alive top +ca".
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Pcp pcp = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] w = line.trim().split("\\s+");
            switch (w[0]) {
                case "dominoes" -> {
                    String[] tops = new String[w.length - 1], bottoms = new String[w.length - 1];
                    for (int i = 1; i < w.length; i++) {
                        String[] d = w[i].split("/");
                        tops[i - 1] = d[0];
                        bottoms[i - 1] = d[1];
                    }
                    pcp = new Pcp(tops, bottoms);
                }
                case "search" -> System.out.println(pcp.search(Integer.parseInt(w[1]), 60));
                case "try" -> {
                    int[] seq = Arrays.stream(w, 1, w.length).mapToInt(Integer::parseInt).toArray();
                    System.out.println(pcp.trySequence(seq));
                }
                default -> { }
            }
        }
    }
}
