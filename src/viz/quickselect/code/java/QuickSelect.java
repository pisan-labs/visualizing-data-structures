import java.util.concurrent.ThreadLocalRandom;

/** Quickselect: the k-th smallest value (k = 1 for the smallest), with a random pivot. */
public class QuickSelect {
    /** Returns the k-th smallest value in a. Reorders a as it goes. */
    public static int select(int[] a, int k) {
        return select(a, k, 0, a.length - 1);
    }

    static int select(int[] a, int k, int p, int r) {
        if (p == r) {
            return a[p];
        }
        int q = randomizedPartition(a, p, r);
        if (k - 1 == q) {
            return a[q];
        }
        if (k - 1 < q) {
            return select(a, k, p, q - 1);
        }
        return select(a, k, q + 1, r);
    }

    static int randomizedPartition(int[] a, int p, int r) {
        swap(a, ThreadLocalRandom.current().nextInt(p, r + 1), r);
        return partition(a, p, r);
    }

    /** Lomuto's partition around a[r]. Returns where the pivot lands. */
    static int partition(int[] a, int p, int r) {
        int x = a[r];
        int i = p - 1;
        for (int j = p; j < r; j++) {
            if (a[j] <= x) {
                i++;
                swap(a, i, j);
            }
        }
        swap(a, i + 1, r);
        return i + 1;
    }

    private static void swap(int[] a, int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
}
