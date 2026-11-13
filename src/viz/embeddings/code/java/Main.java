import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "word w x y" adds a
 * word and "normalize" scales every vector to length 1; neither prints. "sim a b" prints the
 * dot product and the cosine. "nearest cosine|dot k w" prints the k nearest words with their
 * scores; "analogy cosine|dot k a b c" prints a - b + c, a bar, and the k nearest other words.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String ranked(List<Embeddings.Scored> best) {
        StringJoiner out = new StringJoiner(" ");
        for (Embeddings.Scored e : best) out.add(e.word() + " " + three(e.score()));
        return out.toString();
    }

    static double[] find(List<Embeddings.Word> words, String w) {
        for (Embeddings.Word x : words) if (x.word().equals(w)) return x.v();
        throw new IllegalArgumentException("unknown word " + w);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<Embeddings.Word> words = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "word" -> words.add(new Embeddings.Word(p[1], new double[] {
                    Double.parseDouble(p[2]), Double.parseDouble(p[3])}));
                case "normalize" -> {
                    List<Embeddings.Word> unit = new ArrayList<>();
                    for (Embeddings.Word w : words)
                        unit.add(new Embeddings.Word(w.word(), Embeddings.normalize(w.v())));
                    words = unit;
                }
                case "sim" -> {
                    double[] a = find(words, p[1]), b = find(words, p[2]);
                    out.append(three(Embeddings.dot(a, b))).append(' ')
                            .append(three(Embeddings.cosine(a, b))).append('\n');
                }
                case "nearest" -> out.append(ranked(Embeddings.nearest(words, find(words, p[3]),
                        Integer.parseInt(p[2]), p[1].equals("cosine"), Set.of(p[3])))).append('\n');
                case "analogy" -> {
                    double[] t = Embeddings.analogy(
                            find(words, p[3]), find(words, p[4]), find(words, p[5]));
                    Set<String> leaveOut = new HashSet<>(List.of(p[3], p[4], p[5]));
                    List<Embeddings.Scored> best = Embeddings.nearest(words, t,
                            Integer.parseInt(p[2]), p[1].equals("cosine"), leaveOut);
                    out.append(three(t[0])).append(' ').append(three(t[1])).append(" | ")
                            .append(ranked(best)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}
