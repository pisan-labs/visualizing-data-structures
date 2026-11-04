/** Binary search on a sorted array: look at the middle, throw away half. */
public class BinarySearch {
    /** Returns an index of x in a, or -1 if x is not there. */
    public static int search(int[] a, int x) {
        int lo = 0;
        int hi = a.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2; // (lo + hi) / 2 can overflow
            if (a[mid] == x) {
                return mid;
            } else if (a[mid] > x) {
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return -1;
    }

    /** Returns the index of the first x in a, or -1. */
    public static int first(int[] a, int x) {
        int lo = 0;
        int hi = a.length - 1;
        int r = -1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] == x) {
                r = mid; // remember it, keep looking left
                hi = mid - 1;
            } else if (a[mid] > x) {
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return r;
    }

    /** Returns the index of the first value >= x, or a.length if there is none. */
    public static int lowerBound(int[] a, int x) {
        int lo = 0;
        int hi = a.length; // the window is a[lo..hi-1]
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] >= x) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

    /** Returns the index of the first value > x, or a.length if there is none. */
    public static int upperBound(int[] a, int x) {
        int lo = 0;
        int hi = a.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] > x) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

    /**
     * Returns an index of x, or -(insertion point) - 1 if x is not there, like
     * java.util.Arrays.binarySearch.
     */
    public static int locate(int[] a, int x) {
        int lo = 0;
        int hi = a.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] == x) {
                return mid;
            } else if (a[mid] > x) {
                hi = mid - 1;
            } else {
                lo = mid + 1;
            }
        }
        return -(lo + 1); // x would go at index lo
    }
}
