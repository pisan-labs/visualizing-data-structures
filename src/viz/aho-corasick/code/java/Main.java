import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;

/** Test driver: "search P1,P2,... T" prints start:word for every match, or "none". */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length != 3 || !parts[0].equals("search")) {
                continue;
            }
            List<String> found = new AhoCorasick(Arrays.asList(parts[1].split(","))).search(parts[2]);
            out.append(found.isEmpty() ? "none" : String.join(" ", found)).append('\n');
        }
        System.out.print(out);
    }
}
