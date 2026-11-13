import java.util.ArrayList;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Set;

/** Words as vectors: similarity, nearest neighbours by brute force, and analogies. */
public class Embeddings {
    public record Word(String word, double[] v) {}

    public record Scored(String word, int index, double score) {}

    static double dot(double[] a, double[] b) {
        return a[0] * b[0] + a[1] * b[1];
    }

    static double length(double[] a) {
        return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
    }

    /** The cosine of the angle between a and b: 1 when they point the same way. */
    static double cosine(double[] a, double[] b) {
        return dot(a, b) / (length(a) * length(b));
    }

    static double[] normalize(double[] a) {
        double n = length(a);
        return new double[] {a[0] / n, a[1] / n};
    }

    /** Negative when a is the weaker neighbour: a lower score, or a tie and a later word. */
    static int compare(Scored a, Scored b) {
        if (a.score() != b.score()) return a.score() < b.score() ? -1 : 1;
        return Integer.compare(b.index(), a.index());
    }

    /**
     * The k words most similar to target, best first. A min-heap keeps the best k seen so
     * far with the weakest on top, so a word that cannot get in costs one comparison.
     */
    public static List<Scored> nearest(
            List<Word> words, double[] target, int k, boolean cosine, Set<String> leaveOut) {
        PriorityQueue<Scored> heap = new PriorityQueue<>(Embeddings::compare);
        for (int i = 0; i < words.size(); i++) {
            Word w = words.get(i);
            if (leaveOut.contains(w.word())) continue;
            double s = cosine ? cosine(target, w.v()) : dot(target, w.v());
            Scored e = new Scored(w.word(), i, s);
            if (heap.size() < k) {
                heap.add(e);
            } else if (compare(heap.peek(), e) < 0) {
                heap.poll();
                heap.add(e);
            }
        }
        List<Scored> best = new ArrayList<>(heap);
        best.sort((a, b) -> compare(b, a));
        return best;
    }

    /** a - b + c. */
    public static double[] analogy(double[] a, double[] b, double[] c) {
        return new double[] {a[0] - b[0] + c[0], a[1] - b[1] + c[1]};
    }
}
