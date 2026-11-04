/** Linear search: look at each value in turn. */
public class LinearSearch {
    /** Returns the index of the first x in a, or -1 if x is not there. */
    public static int search(int[] a, int x) {
        for (int i = 0; i < a.length; i++) {
            if (a[i] == x) {
                return i;
            }
        }
        return -1;
    }
}
