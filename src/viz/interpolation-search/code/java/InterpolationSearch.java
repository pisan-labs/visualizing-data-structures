/** Interpolation search: guess where x is from its value, not from the middle. */
public final class InterpolationSearch {
    private InterpolationSearch() { }

    /** Returns an index of x in the sorted array a, or -1 if x is not there. */
    public static int search(int[] a, int x) {
        int lo = 0;
        int hi = a.length - 1;
        while (lo <= hi && a[lo] <= x && x <= a[hi]) {
            if (a[lo] == a[hi]) {
                return lo; // the whole window is x; avoid dividing by 0
            }
            // long: (x - a[lo]) * (hi - lo) can overflow an int on big values.
            int pos = lo + (int) ((long) (x - a[lo]) * (hi - lo) / (a[hi] - a[lo]));
            if (a[pos] == x) {
                return pos;
            }
            if (a[pos] < x) {
                lo = pos + 1;
            } else {
                hi = pos - 1;
            }
        }
        return -1;
    }
}
