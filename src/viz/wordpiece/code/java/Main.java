import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "reset" forgets the
 * training words and "word count letters" adds one; neither prints. "train k" learns k merges
 * from the start and "merge" one more; both print the merges as a+b, or "none".
 * "encode maxLength letters" prints the pieces.
 */
public class Main {
    static String merges(List<WordPiece.Pair> ms) {
        StringJoiner out = new StringJoiner(" ");
        for (WordPiece.Pair p : ms) out.add(p.a() + "+" + p.b());
        return ms.isEmpty() ? "none" : out.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        Map<List<String>, Integer> start = new LinkedHashMap<>();
        Map<List<String>, Integer> words = new LinkedHashMap<>();
        List<WordPiece.Pair> learned = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "reset" -> {
                    start.clear();
                    words.clear();
                    learned.clear();
                }
                case "word" -> {
                    String word = String.join("", Arrays.asList(p).subList(2, p.length));
                    start.put(WordPiece.split(word), Integer.parseInt(p[1]));
                    words = new LinkedHashMap<>(start);
                }
                case "train" -> {
                    words = new LinkedHashMap<>(start);
                    learned = WordPiece.train(words, Integer.parseInt(p[1]));
                    out.append(merges(learned)).append('\n');
                }
                case "merge" -> {
                    List<WordPiece.Pair> more = WordPiece.train(words, 1);
                    learned.addAll(more);
                    out.append(merges(more)).append('\n');
                }
                case "encode" -> {
                    Set<String> vocab = new LinkedHashSet<>();
                    for (List<String> w : start.keySet()) vocab.addAll(w);
                    for (WordPiece.Pair m : learned) vocab.add(WordPiece.join(m.a(), m.b()));
                    String word = String.join("", Arrays.asList(p).subList(2, p.length));
                    List<String> pieces = WordPiece.encode(word, WordPiece.buildTrie(vocab), Integer.parseInt(p[1]));
                    out.append(String.join(" ", pieces)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        byte[] bytes = out.toString().getBytes(StandardCharsets.UTF_8);
        System.out.write(bytes, 0, bytes.length);
        System.out.flush();
    }
}
