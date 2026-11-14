public class ThreeWay {
    /**
     * Rearranges a in place: values below p, then values equal to p, then values above p. One
     * pass, O(1) extra space. Returns {low, high}: a[low..high] holds the values equal to p
     * (none when low > high).
     */
    public static int[] partition(int[] a, int p) {
        int low = 0, mid = 0, high = a.length - 1;
        while (mid <= high) { // a[mid..high] is still unknown
            if (a[mid] < p) {
                swap(a, low, mid); // a[low] was a p (or is a[mid] itself)
                low++;
                mid++;
            } else if (a[mid] > p) {
                swap(a, mid, high); // the value that comes to mid is unknown
                high--;
            } else {
                mid++;
            }
        }
        return new int[] {low, high};
    }

    private static void swap(int[] a, int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
}
