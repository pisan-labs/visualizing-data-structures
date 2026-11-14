import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Test driver: reads one operation per line, prints one result per line. "s sentence" adds a
 * training sentence (no output). "round k greedy|sample prefix ... | u ..." runs one round with
 * a bigram draft and a trigram target (the bigram where the trigram never saw the context) and
 * prints the drafts accepted, a bar, and the words added.
 */
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> sentences = new ArrayList<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] a = line.trim().split("\\s+");
            if (a[0].isEmpty()) continue;
            switch (a[0]) {
                case "s" -> sentences.add(String.join(" ", Arrays.copyOfRange(a, 1, a.length)));
                case "round" -> {
                    var bigram = Speculative.ngramModel(sentences, 2);
                    var trigram = Speculative.ngramModel(sentences, 3);
                    Function<List<String>, Map<String, Double>> target = ctx -> {
                        Map<String, Double> t = trigram.apply(ctx);
                        return t != null ? t : bigram.apply(ctx);
                    };
                    int bar = Arrays.asList(a).indexOf("|");
                    List<String> prefix = List.of(Arrays.copyOfRange(a, 3, bar));
                    List<Double> us = new ArrayList<>();
                    for (int i = bar + 1; i < a.length; i++) us.add(Double.parseDouble(a[i]));
                    Speculative.Result r = Speculative.step(prefix, Integer.parseInt(a[1]), bigram,
                            target, us.iterator(), a[2].equals("greedy"));
                    out.append(r.accepted()).append(" | ").append(String.join(" ", r.words()))
                            .append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + a[0]);
            }
        }
        System.out.print(out);
    }
}
