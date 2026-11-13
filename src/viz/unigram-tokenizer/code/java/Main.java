import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line. "text word count ..."
 * sets the training words (no output). "seed size" builds the seed vocabulary and prints its
 * pieces of two or more letters. "encode word" prints the best split, a bar, and its
 * log-probability. "prune floor" prints the pieces one round removes, or "-".
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String joined(List<String> xs) {
        return xs.isEmpty() ? "-" : String.join(" ", xs);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> words = new ArrayList<>();
        List<Integer> counts = new ArrayList<>();
        LinkedHashMap<String, Integer> vocab = new LinkedHashMap<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] a = line.trim().split("\\s+");
            if (a[0].isEmpty()) continue;
            switch (a[0]) {
                case "text" -> {
                    words.clear();
                    counts.clear();
                    for (int i = 1; i + 1 < a.length; i += 2) {
                        words.add(a[i]);
                        counts.add(Integer.parseInt(a[i + 1]));
                    }
                }
                case "seed" -> {
                    vocab = Unigram.seedVocab(words, counts, Integer.parseInt(a[1]));
                    List<String> longer = new ArrayList<>();
                    for (String x : vocab.keySet()) if (x.length() > 1) longer.add(x);
                    out.append(joined(longer)).append('\n');
                }
                case "encode" -> {
                    Unigram.Split s = Unigram.viterbi(a[1], Unigram.logProbs(vocab), null);
                    out.append(String.join(" ", s.pieces())).append(" | ")
                            .append(three(s.score())).append('\n');
                }
                case "prune" -> out.append(joined(
                        Unigram.prune(words, counts, vocab, Integer.parseInt(a[1])))).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + a[0]);
            }
        }
        System.out.print(out);
    }
}
