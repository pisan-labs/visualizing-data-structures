import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * LZ77 writes (offset, length, next) triples: go back offset, copy length characters, then add
 * next. LZW writes dictionary codes and learns a new string with every code.
 */
public final class Lz {
    private Lz() {}

    public record Triple(int offset, int length, char next) {}

    public static List<Triple> lz77(String text, int window, int lookahead) {
        List<Triple> out = new ArrayList<>();
        int pos = 0;
        while (pos < text.length()) {
            int longest = Math.min(lookahead, text.length() - pos - 1); // always leave a next
            int bestOff = 0;
            int bestLen = 0;
            for (int d = 1; d <= Math.min(window, pos); d++) {
                int k = 0;
                while (k < longest && text.charAt(pos - d + k) == text.charAt(pos + k)) {
                    k++;
                }
                if (k > bestLen) { // nearest wins a tie
                    bestOff = d;
                    bestLen = k;
                }
            }
            out.add(new Triple(bestOff, bestLen, text.charAt(pos + bestLen)));
            pos += bestLen + 1;
        }
        return out;
    }

    public static String unlz77(List<Triple> triples) {
        StringBuilder out = new StringBuilder();
        for (Triple t : triples) {
            for (int i = 0; i < t.length(); i++) { // one at a time: a copy may overlap itself
                out.append(out.charAt(out.length() - t.offset()));
            }
            out.append(t.next());
        }
        return out.toString();
    }

    public static List<Integer> lzw(String text) {
        Map<String, Integer> codes = new HashMap<>();
        for (int b = 0; b < 256; b++) {
            codes.put(String.valueOf((char) b), b);
        }
        List<Integer> out = new ArrayList<>();
        String w = "";
        for (char c : text.toCharArray()) {
            if (codes.containsKey(w + c)) {
                w = w + c;
            } else {
                out.add(codes.get(w));
                codes.put(w + c, codes.size());
                w = String.valueOf(c);
            }
        }
        if (!w.isEmpty()) {
            out.add(codes.get(w));
        }
        return out;
    }

    public static String unlzw(List<Integer> codes) {
        Map<Integer, String> strings = new HashMap<>();
        for (int b = 0; b < 256; b++) {
            strings.put(b, String.valueOf((char) b));
        }
        StringBuilder out = new StringBuilder();
        String prev = null;
        for (int code : codes) {
            String cur = strings.containsKey(code)
                    ? strings.get(code)
                    : prev + prev.charAt(0); // made by the encoder on this very step
            if (prev != null) {
                strings.put(strings.size(), prev + cur.charAt(0));
            }
            out.append(cur);
            prev = cur;
        }
        return out.toString();
    }
}
