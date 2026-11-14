import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;

/**
 * Test driver: "lock goal b1 b2 ..." prints the fewest turns from all zeros to goal, never
 * showing a barred combination; "words goal w1 w2 ..." prints the fewest one-letter changes from
 * w1 to goal through the list. Both print -1 when the goal cannot be reached.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 2) continue;
            List<String> rest = Arrays.asList(p).subList(2, p.length);
            switch (p[0]) {
                case "lock" -> System.out.println(StateBfs.lockMoves(rest, p[1]));
                case "words" -> System.out.println(StateBfs.wordMoves(rest, p[1]));
                default -> {}
            }
        }
    }
}
