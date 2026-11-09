public final class TwoPointers {
    private TwoPointers() {}

    /** Indices {lo, hi} with a[lo] + a[hi] == target in sorted a, or null. */
    public static int[] pairSum(int[] a, int target) {
        int lo = 0, hi = a.length - 1;
        while (lo < hi) {
            int sum = a[lo] + a[hi];
            if (sum == target) return new int[] {lo, hi};
            if (sum < target) lo++; // a[lo] is too small for every partner left
            else hi--;              // a[hi] is too big for every partner left
        }
        return null;
    }

    /** The most water two walls hold: min(a[i], a[j]) * (j - i). */
    public static int maxWater(int[] a) {
        int lo = 0, hi = a.length - 1, best = 0;
        while (lo < hi) {
            best = Math.max(best, Math.min(a[lo], a[hi]) * (hi - lo));
            if (a[lo] < a[hi]) lo++;
            else hi--;
        }
        return best;
    }

    /** Keep one copy of each value of sorted a in a[0..k-1]; return k. */
    public static int removeDuplicates(int[] a) {
        if (a.length == 0) return 0;
        int slow = 0;
        for (int fast = 1; fast < a.length; fast++) {
            if (a[fast] != a[slow]) {
                slow++;
                a[slow] = a[fast];
            }
        }
        return slow + 1;
    }

    public static void reverse(int[] a) {
        for (int lo = 0, hi = a.length - 1; lo < hi; lo++, hi--) {
            int t = a[lo];
            a[lo] = a[hi];
            a[hi] = t;
        }
    }
}
