import java.util.Arrays;

public class SearchAnswer {
    /** Can capacity c ship the packages w, in order, in d days? */
    static boolean fits(int[] w, int d, int c) {
        int days = 1, load = 0;
        for (int x : w) {
            if (load + x > c) { // x does not fit today: it goes on a new day
                days++;
                load = 0;
                if (days > d) return false;
            }
            load += x;
        }
        return true;
    }

    /** The smallest capacity that ships w in d days. */
    public static int smallestCapacity(int[] w, int d) {
        int lo = 0, hi = 0; // the heaviest must fit; one day takes everything
        for (int x : w) {
            lo = Math.max(lo, x);
            hi += x;
        }
        while (lo < hi) {
            int mid = (lo + hi) / 2;
            if (fits(w, d, mid)) hi = mid; // mid works: the answer is mid or less
            else lo = mid + 1; // mid is too small, and so is everything below it
        }
        return lo;
    }

    /** Can k items sit on the sorted positions p with every gap at least g? */
    static boolean spreads(int[] p, int k, int g) {
        int count = 1, last = p[0];
        for (int i = 1; i < p.length; i++) {
            if (p[i] - last >= g) { // far enough from the last item: put one here
                count++;
                last = p[i];
                if (count == k) return true;
            }
        }
        return false;
    }

    /** The largest smallest gap k items can keep on the positions p (all different). */
    public static int largestGap(int[] positions, int k) {
        int[] p = positions.clone();
        Arrays.sort(p);
        int lo = 1, hi = p[p.length - 1] - p[0];
        while (lo < hi) {
            int mid = (lo + hi + 1) / 2; // round up, or lo = mid could repeat forever
            if (spreads(p, k, mid)) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }
}
