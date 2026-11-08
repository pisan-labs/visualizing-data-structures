import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "length s" prints the length of the longest palindromic subsequence of s;
 * "palindrome s" prints the length and one such palindrome.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length != 2) {
                continue;
            }
            switch (p[0]) {
                case "length" -> out.append(Palindrome.table(p[1])[0][p[1].length() - 1]).append('\n');
                case "palindrome" -> {
                    String pal = Palindrome.longest(p[1]);
                    out.append(pal.length()).append(' ').append(pal).append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}
