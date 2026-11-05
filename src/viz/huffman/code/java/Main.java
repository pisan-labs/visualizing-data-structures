import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Test driver: reads one operation per line, prints one result per line. A space is written _.
 *   build s:count ...  ->  "<total bits> <symbol>:<code> ..." in symbol order
 *   encode <text>      ->  the bits
 *   decode <bits>      ->  the text, or "invalid"
 * Every correct Huffman tree gives the same total. The codes, and so the decoded text, also
 * depend on how ties are broken: this code follows the page's default rule (leaves first, then
 * the oldest merged tree), so it prints the same codes as the page with that setting.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Huffman.Node root = null;
        Map<Character, String> table = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "build" -> {
                    TreeMap<Character, Integer> counts = new TreeMap<>();
                    for (int i = 1; i < parts.length; i++) {
                        String[] pair = parts[i].split(":");
                        char s = pair[0].charAt(0) == '_' ? ' ' : pair[0].charAt(0);
                        counts.put(s, Integer.parseInt(pair[1]));
                    }
                    root = Huffman.build(counts);
                    table = Huffman.codes(root);
                    int total = 0;
                    List<String> pairs = new ArrayList<>();
                    for (Map.Entry<Character, String> e : table.entrySet()) {
                        total += counts.get(e.getKey()) * e.getValue().length();
                        pairs.add((e.getKey() == ' ' ? '_' : e.getKey()) + ":" + e.getValue());
                    }
                    out.append(total).append(' ').append(String.join(" ", pairs)).append('\n');
                }
                case "encode" -> out.append(Huffman.encode(parts[1].replace('_', ' '), table))
                        .append('\n');
                case "decode" -> {
                    String text = Huffman.decode(parts[1], root);
                    out.append(text == null ? "invalid" : text.replace(' ', '_')).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}
