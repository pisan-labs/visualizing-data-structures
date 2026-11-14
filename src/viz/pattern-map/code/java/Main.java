import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Test driver: "follow <cue>" prints the pattern the cue points to ("none" if the words are not
 * a cue); "family <name>" prints the family's patterns, separated by spaces.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in =
                new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            int space = line.indexOf(' ');
            String cmd = space < 0 ? line : line.substring(0, space);
            String arg = space < 0 ? "" : line.substring(space + 1);
            switch (cmd) {
                case "follow" -> {
                    String p = PatternMap.follow(arg);
                    System.out.println(p == null ? "none" : p);
                }
                case "family" -> {
                    List<String> ps = PatternMap.family(arg);
                    System.out.println(ps.isEmpty() ? "none" : String.join(" ", ps));
                }
                default -> {}
            }
        }
    }
}
