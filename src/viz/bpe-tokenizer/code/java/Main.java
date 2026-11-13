import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "reset" forgets the
 * training words; "word count tokens" adds one, already split; "known tokens" adds starting
 * symbols no word has (all 256 bytes). None of these print. "train k first|alpha" learns k
 * merges from the start and "merge first|alpha" one more; both print the merges as a+b, or
 * "none". "encode tokens" prints the tokens.
 */
public class Main {
    static String merges(List<Bpe.Pair> ms) {
        StringJoiner out = new StringJoiner(" ");
        for (Bpe.Pair p : ms) out.add(p.a() + "+" + p.b());
        return ms.isEmpty() ? "none" : out.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        Map<List<String>, Integer> start = new LinkedHashMap<>();
        Map<List<String>, Integer> words = new LinkedHashMap<>();
        List<Bpe.Pair> learned = new ArrayList<>();
        Set<String> alphabet = new HashSet<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            List<String> rest = Arrays.asList(p).subList(1, p.length);
            switch (p[0]) {
                case "reset" -> {
                    start.clear();
                    words.clear();
                    learned.clear();
                    alphabet.clear();
                }
                case "word" -> {
                    List<String> tokens = new ArrayList<>(rest.subList(1, rest.size()));
                    start.put(tokens, Integer.parseInt(rest.get(0)));
                    words = new LinkedHashMap<>(start);
                    alphabet.addAll(tokens);
                }
                case "known" -> alphabet.addAll(rest);
                case "train" -> {
                    words = new LinkedHashMap<>(start);
                    learned = Bpe.train(words, Integer.parseInt(p[1]), p[2].equals("alpha"));
                    out.append(merges(learned)).append('\n');
                }
                case "merge" -> {
                    List<Bpe.Pair> more = Bpe.train(words, 1, p[1].equals("alpha"));
                    learned.addAll(more);
                    out.append(merges(more)).append('\n');
                }
                case "encode" -> out.append(String.join(" ", Bpe.encode(rest, learned, alphabet))).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        byte[] bytes = out.toString().getBytes(StandardCharsets.UTF_8);
        System.out.write(bytes, 0, bytes.length);
        System.out.flush();
    }
}
