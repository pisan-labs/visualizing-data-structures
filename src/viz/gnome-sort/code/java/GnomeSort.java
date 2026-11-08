/** Gnome sort: one index walks forward past pairs in order and back after each swap. */
public final class GnomeSort {
    private GnomeSort() { }

    public static void sort(int[] a) {
        int pos = 0;
        while (pos < a.length) {
            if (pos == 0 || a[pos - 1] <= a[pos]) {
                pos++;
            } else {
                int t = a[pos];
                a[pos] = a[pos - 1];
                a[pos - 1] = t;
                pos--;
            }
        }
    }
}
