/** Comb sort: bubble sort with a gap that shrinks by a factor of 1.3 each pass. */
public final class CombSort {
    private CombSort() { }

    public static void sort(int[] a) {
        int gap = a.length;
        boolean done = false;
        while (!done) {
            gap = gap * 10 / 13; // floor(gap / 1.3), in whole numbers
            if (gap <= 1) {
                gap = 1;
                done = true; // unless this pass swaps something
            }
            for (int i = 0; i + gap < a.length; i++) {
                if (a[i] > a[i + gap]) {
                    int t = a[i];
                    a[i] = a[i + gap];
                    a[i + gap] = t;
                    done = false;
                }
            }
        }
    }
}
