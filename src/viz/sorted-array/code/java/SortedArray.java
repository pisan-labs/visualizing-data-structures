import java.util.NoSuchElementException;

/** A fixed-capacity array of numbers kept in sorted order. */
public class SortedArray {
    private final int[] data;
    private int size = 0;

    public SortedArray(int capacity) {
        data = new int[capacity];
    }

    public void insert(int x) {
        if (size == data.length) {
            throw new IllegalStateException("array is full");
        }
        int j = size - 1;
        while (j >= 0 && data[j] > x) {
            data[j + 1] = data[j];
            j = j - 1;
        }
        data[j + 1] = x;
        size = size + 1;
    }

    /** Binary search: the index of x, or -1. */
    public int search(int x) {
        int lo = 0;
        int hi = size - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2; // (lo + hi) / 2 can overflow on huge arrays
            if (data[mid] == x) {
                return mid;
            } else if (data[mid] < x) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return -1;
    }

    public boolean delete(int x) {
        int i = search(x);
        if (i == -1) {
            return false;
        }
        for (int j = i; j < size - 1; j++) {
            data[j] = data[j + 1];
        }
        size = size - 1;
        return true;
    }

    public int min() {
        if (size == 0) {
            throw new NoSuchElementException("array is empty");
        }
        return data[0];
    }

    public int max() {
        if (size == 0) {
            throw new NoSuchElementException("array is empty");
        }
        return data[size - 1];
    }

    /** The first index whose item is >= x (size if there is none). */
    public int lowerBound(int x) {
        int lo = 0;
        int hi = size;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (data[mid] < x) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    /** The first index whose item is > x (size if there is none). */
    public int upperBound(int x) {
        int lo = 0;
        int hi = size;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (data[mid] <= x) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }
}
