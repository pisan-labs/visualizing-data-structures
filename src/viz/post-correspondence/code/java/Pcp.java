import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** The Post correspondence problem: dominoes with a string on top and one below. */
public class Pcp {
    private record Partial(List<Integer> seq, String top, String bottom) {}

    private final String[] tops;
    private final String[] bottoms;

    public Pcp(String[] tops, String[] bottoms) {
        this.tops = tops;
        this.bottoms = bottoms;
    }

    /** Where the two strings first disagree, or -1 if one is a prefix of the other. */
    static int mismatch(String top, String bottom) {
        int k = Math.min(top.length(), bottom.length());
        for (int i = 0; i < k; i++) if (top.charAt(i) != bottom.charAt(i)) return i;
        return -1;
    }

    /** The longer side and what it has left over, such as "top +ca". */
    static String overhang(String top, String bottom) {
        int k = Math.min(top.length(), bottom.length());
        return top.length() > k ? "top +" + top.substring(k) : "bottom +" + bottom.substring(k);
    }

    /** Lays down the dominoes numbered in seq (from 1), stopping where the strings disagree. */
    public String trySequence(int[] seq) {
        String top = "", bottom = "";
        for (int i : seq) {
            top += tops[i - 1];
            bottom += bottoms[i - 1];
            int at = mismatch(top, bottom);
            if (at >= 0) return "dead at column " + (at + 1);
        }
        return top.equals(bottom) ? "match" : "alive " + overhang(top, bottom);
    }

    /**
     * Breadth-first search for a match of at most `bound` dominoes. Returns "match 2 1 3" (domino
     * numbers from 1), "no match" when every branch died, "none up to <bound>" when some partial
     * match was cut off at the bound, or "gave up" after extending `limit` partial matches.
     */
    public String search(int bound, int limit) {
        ArrayDeque<Partial> queue = new ArrayDeque<>();
        queue.add(new Partial(List.of(), "", ""));
        int cut = 0, expanded = 0;
        while (!queue.isEmpty()) {
            if (expanded == limit) return "gave up";
            Partial p = queue.poll();
            expanded++;
            for (int i = 0; i < tops.length; i++) {
                List<Integer> seq = new ArrayList<>(p.seq());
                seq.add(i + 1);
                String top = p.top() + tops[i], bottom = p.bottom() + bottoms[i];
                if (mismatch(top, bottom) >= 0) continue; // dead: nothing added later can fix it
                if (top.equals(bottom)) {
                    StringBuilder sb = new StringBuilder("match");
                    for (int k : seq) sb.append(' ').append(k);
                    return sb.toString();
                }
                if (seq.size() == bound) cut++; // alive, but as long as allowed
                else queue.add(new Partial(seq, top, bottom));
            }
        }
        return cut > 0 ? "none up to " + bound : "no match";
    }
}
