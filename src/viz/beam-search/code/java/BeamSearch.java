import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Beam search over a next-word model: model.get(word) lists the next words and probabilities. */
public class BeamSearch {
    static final String EOS = "</s>";

    /** A next word and its probability. */
    public record Next(String word, double p) {}

    /** A hypothesis: the words after the start, and their log-probability. */
    public record Hyp(List<String> words, String last, double score) {
        Hyp extend(Next n) {
            List<String> w = new ArrayList<>(words);
            w.add(n.word());
            return new Hyp(w, n.word(), score + StrictMath.log(n.p()));
        }
    }

    /** The finished hypotheses in the order they finished; the best is picked by the caller. */
    static List<Hyp> search(Map<String, List<Next>> model, String start, int width, String eos,
                            int maxLen) {
        List<Hyp> beam = new ArrayList<>(List.of(new Hyp(List.of(), start, 0)));
        List<Hyp> finished = new ArrayList<>();
        int room = width;
        for (int t = 0; t < maxLen; t++) {
            List<Hyp> candidates = new ArrayList<>();
            for (Hyp h : beam)
                for (Next n : model.getOrDefault(h.last(), List.of())) candidates.add(h.extend(n));
            // Best first; List.sort is stable, so ties keep the order made.
            candidates.sort(Comparator.comparingDouble((Hyp h) -> -h.score()));
            beam = new ArrayList<>();
            if (eos.equals("shrink")) { // a finished hypothesis leaves, and the beam narrows
                int top = Math.min(room, candidates.size());
                for (Hyp c : candidates.subList(0, top)) {
                    if (c.last().equals(EOS)) {
                        finished.add(c);
                        room--;
                    } else beam.add(c);
                }
                if (room == 0) break;
            } else { // refill: keep width going; stop once width have finished
                for (int rank = 0; rank < candidates.size(); rank++) {
                    Hyp c = candidates.get(rank);
                    if (c.last().equals(EOS)) {
                        if (rank < width) finished.add(c);
                    } else if (beam.size() < width) beam.add(c);
                }
                if (finished.size() >= width) {
                    beam.clear();
                    break;
                }
            }
            if (beam.isEmpty()) break;
        }
        finished.addAll(beam); // still going at the length limit: cut there
        return finished;
    }

    /** The best finished hypothesis: by log-probability, or by log-probability per word. */
    static Hyp best(List<Hyp> finished, boolean normalize) {
        Hyp best = null;
        for (Hyp h : finished)
            if (best == null || key(h, normalize) > key(best, normalize)) best = h;
        return best;
    }

    static double key(Hyp h, boolean normalize) {
        return normalize ? h.score() / h.words().size() : h.score();
    }
}
