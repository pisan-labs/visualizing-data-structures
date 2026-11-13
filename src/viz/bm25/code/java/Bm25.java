import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;

/** Term -> postings list of (document, term frequency), ranked with BM25. */
public class Bm25 {
    public record Posting(int doc, int tf) {}

    public record Hit(int doc, double score) {}

    final Map<String, List<Posting>> index = new HashMap<>(); // in document order
    final List<Integer> lengths = new ArrayList<>(); // documents count from 1

    public int add(List<String> words) {
        int doc = lengths.size() + 1;
        lengths.add(words.size());
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String w : words) counts.merge(w, 1, Integer::sum);
        for (Map.Entry<String, Integer> c : counts.entrySet())
            index.computeIfAbsent(c.getKey(), t -> new ArrayList<>()).add(new Posting(doc, c.getValue()));
        return doc;
    }

    /** a is a weaker hit than b: a lower score, or the same score and a later document. */
    static boolean weaker(Hit a, Hit b) {
        return a.score() < b.score() || (a.score() == b.score() && a.doc() > b.doc());
    }

    /** The k best hits, best first. */
    public List<Hit> search(List<String> query, double k1, double b, String idf, int k) {
        int n = lengths.size();
        double total = 0;
        for (int len : lengths) total += len;
        double avgdl = total / n;
        Map<Integer, Double> scores = new LinkedHashMap<>();
        for (String term : query) { // a word typed twice counts twice
            List<Posting> postings = index.get(term);
            if (postings == null) continue;
            double ratio = (n - postings.size() + 0.5) / (postings.size() + 0.5);
            double weight = idf.equals("rsj") ? StrictMath.log(ratio) : StrictMath.log(1 + ratio);
            for (Posting p : postings) {
                double B = 1 - b + b * lengths.get(p.doc() - 1) / avgdl;
                scores.merge(p.doc(), weight * (p.tf() / (p.tf() + k1 * B)), Double::sum);
            }
        }
        // A heap of size k: the weakest kept on top.
        PriorityQueue<Hit> heap = new PriorityQueue<>((x, y) -> weaker(x, y) ? -1 : weaker(y, x) ? 1 : 0);
        for (Map.Entry<Integer, Double> s : scores.entrySet()) {
            Hit h = new Hit(s.getKey(), s.getValue());
            if (heap.size() < k) heap.add(h);
            else if (weaker(heap.peek(), h)) {
                heap.poll();
                heap.add(h);
            }
        }
        List<Hit> out = new ArrayList<>();
        while (!heap.isEmpty()) out.add(0, heap.poll());
        return out;
    }
}
