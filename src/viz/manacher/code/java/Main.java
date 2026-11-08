import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.stream.Collectors;

/** Test driver: "radii S" prints p; "longest S" prints the longest palindromic substring. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length != 2) {
                continue;
            }
            if (parts[0].equals("radii")) {
                int[] p = Manacher.radii(parts[1]);
                String values =
                        Arrays.stream(p).mapToObj(String::valueOf).collect(Collectors.joining(" "));
                out.append(values).append('\n');
            } else if (parts[0].equals("longest")) {
                out.append(Manacher.longestPalindrome(parts[1])).append('\n');
            }
        }
        System.out.print(out);
    }
}
