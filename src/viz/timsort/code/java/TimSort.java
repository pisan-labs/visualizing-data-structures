import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Timsort, the core of it: find natural runs, grow short ones to MINRUN with binary insertion
 * sort, and merge them off a stack that keeps |Z| > |Y| + |X| and |Y| > |X| (X on top).
 * java.util.Arrays.sort uses the full version for objects.
 */
public final class TimSort {
    private static final int MINRUN = 4; // real Timsort picks 32 to 64 from n

    private TimSort() { }

    public static void sort(int[] a) {
        int n = a.length;
        List<int[]> stack = new ArrayList<>(); // {base, length}
        int lo = 0;
        while (lo < n) {
            int end = runEnd(a, lo);
            if (end - lo < MINRUN && end < n) {
                end = Math.min(lo + MINRUN, n);
                binaryInsertionSort(a, lo, end);
            }
            stack.add(new int[] {lo, end - lo});
            lo = end;
            collapse(a, stack);
        }
        while (stack.size() > 1) {
            int i = stack.size() - 2;
            if (i > 0 && stack.get(i - 1)[1] < stack.get(i + 1)[1]) {
                i--;
            }
            mergeAt(a, stack, i);
        }
    }

    /** End (exclusive) of the natural run at a[lo]; a strictly falling run is reversed. */
    private static int runEnd(int[] a, int lo) {
        int end = lo + 1;
        if (end == a.length) {
            return end;
        }
        if (a[end] < a[lo]) {
            while (end + 1 < a.length && a[end + 1] < a[end]) {
                end++;
            }
            for (int i = lo, j = end; i < j; i++, j--) {
                int t = a[i];
                a[i] = a[j];
                a[j] = t;
            }
        } else {
            while (end + 1 < a.length && a[end + 1] >= a[end]) {
                end++;
            }
        }
        return end + 1;
    }

    private static void binaryInsertionSort(int[] a, int lo, int end) {
        for (int i = lo + 1; i < end; i++) {
            int key = a[i];
            int left = lo;
            int right = i;
            while (left < right) {
                int mid = (left + right) >>> 1;
                if (a[mid] <= key) {
                    left = mid + 1;
                } else {
                    right = mid;
                }
            }
            System.arraycopy(a, left, a, left + 1, i - left);
            a[left] = key;
        }
    }

    private static void collapse(int[] a, List<int[]> stack) {
        while (stack.size() > 1) {
            int i = stack.size() - 2;
            int y = stack.get(i)[1];
            int x = stack.get(i + 1)[1];
            boolean zBad = i > 0 && stack.get(i - 1)[1] <= y + x;
            boolean wBad = i > 1 && stack.get(i - 2)[1] <= stack.get(i - 1)[1] + y;
            if (zBad || wBad) {
                if (stack.get(i - 1)[1] < x) {
                    i--;
                }
            } else if (y > x) {
                return;
            }
            mergeAt(a, stack, i);
        }
    }

    /** How many of a[base..base+len-1] are <= key: jumps of 1, 3, 7, ..., then binary search. */
    private static int gallopRight(int key, int[] a, int base, int len) {
        if (a[base] > key) {
            return 0;
        }
        int last = 0;
        int ofs = 1;
        while (ofs < len && a[base + ofs] <= key) {
            last = ofs;
            ofs = 2 * ofs + 1;
        }
        int lo = last + 1;
        int hi = Math.min(ofs, len);
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (a[base + mid] <= key) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    /** How many of a[base..base+len-1] are < key, galloping from the right. */
    private static int gallopLeft(int key, int[] a, int base, int len) {
        if (a[base + len - 1] < key) {
            return len;
        }
        int last = len - 1;
        int ofs = 1;
        while (ofs < len && a[base + len - 1 - ofs] >= key) {
            last = len - 1 - ofs;
            ofs = 2 * ofs + 1;
        }
        int lo = Math.max(len - 1 - ofs, -1) + 1;
        int hi = last;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (a[base + mid] < key) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    private static void mergeAt(int[] a, List<int[]> stack, int i) {
        int baseA = stack.get(i)[0];
        int lenA = stack.get(i)[1];
        int baseB = stack.get(i + 1)[0];
        int lenB = stack.get(i + 1)[1];
        stack.set(i, new int[] {baseA, lenA + lenB});
        stack.remove(i + 1);
        int skip = gallopRight(a[baseB], a, baseA, lenA); // already in place
        baseA += skip;
        lenA -= skip;
        if (lenA == 0) {
            return;
        }
        lenB = gallopLeft(a[baseA + lenA - 1], a, baseB, lenB);
        int[] tmp = Arrays.copyOfRange(a, baseA, baseA + lenA);
        int t = 0;
        int j = baseB;
        int k = baseA;
        while (t < tmp.length && j < baseB + lenB) {
            a[k++] = tmp[t] <= a[j] ? tmp[t++] : a[j++]; // ties go left: stable
        }
        while (t < tmp.length) {
            a[k++] = tmp[t++];
        }
    }
}
