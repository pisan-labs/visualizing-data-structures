import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads "reverse s" or "swap s", one per line, and prints each reversed string. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "reverse" -> out.append(Reverse.reverse(parts[1])).append('\n');
                case "swap" -> {
                    char[] a = parts[1].toCharArray();
                    Reverse.reverseInPlace(a, 0, a.length - 1);
                    out.append(new String(a)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
