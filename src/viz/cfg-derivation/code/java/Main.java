import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Test driver: reads one operation per line, prints one result per line. "load S -> aSb | eps"
 * loads a grammar (and prints nothing); "derive aabb" prints "S => aSb => aaSbb => aabb", or
 * "no", or "gave up".
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Map<Character, List<String>> rules = new LinkedHashMap<>();
        char start = 'S';
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split(" ", 2);
            String arg = parts.length > 1 ? parts[1].trim() : "";
            if (parts[0].equals("load")) {
                rules = new LinkedHashMap<>();
                start = 0;
                for (String item : arg.split(";")) {
                    String[] sides = item.split("->", 2);
                    char head = sides[0].trim().charAt(0);
                    if (start == 0) start = head;
                    List<String> bodies = rules.computeIfAbsent(head, k -> new ArrayList<>());
                    for (String alt : sides[1].split("\\|", -1)) {
                        String rhs = alt.replaceAll("\\s", "");
                        if (rhs.equals("eps")) rhs = "";
                        if (!bodies.contains(rhs)) bodies.add(rhs);
                    }
                }
            } else if (parts[0].equals("derive")) {
                String word = arg.equals("eps") ? "" : arg;
                Derivation.Result r = Derivation.leftmost(rules, start, word);
                if (r.gaveUp()) {
                    out.append("gave up\n");
                } else if (r.forms().isEmpty()) {
                    out.append("no\n");
                } else {
                    List<String> shown = new ArrayList<>();
                    for (String f : r.forms()) shown.add(f.isEmpty() ? "eps" : f);
                    out.append(String.join(" => ", shown)).append("\n");
                }
            }
        }
        System.out.print(out);
    }
}
