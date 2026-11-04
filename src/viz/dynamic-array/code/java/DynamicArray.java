import java.util.NoSuchElementException;

/**
 * An array that doubles when full and halves when a quarter full. Each resize copies every
 * item, but resizes are rare enough that append costs O(1) amortized.
 */
public class DynamicArray<T> {
    private Object[] data;
    private int size = 0;

    public DynamicArray(int capacity) {
        data = new Object[capacity];
    }

    public int size() {
        return size;
    }

    public int capacity() {
        return data.length;
    }

    private void resize(int capacity) {
        Object[] fresh = new Object[capacity];
        for (int k = 0; k < size; k++) {
            fresh[k] = data[k];
        }
        data = fresh;
    }

    private void check(int i, int limit) {
        if (i < 0 || i >= limit) {
            throw new IndexOutOfBoundsException("index out of range");
        }
    }

    private void shrinkIfSparse() {
        if (size > 0 && size == data.length / 4) {
            resize(data.length / 2);
        }
    }

    public void append(T x) {
        if (size == data.length) {
            resize(2 * data.length);
        }
        data[size] = x;
        size = size + 1;
    }

    public void insert(int i, T x) {
        check(i, size + 1);
        if (size == data.length) {
            resize(2 * data.length);
        }
        for (int j = size; j > i; j--) {
            data[j] = data[j - 1];
        }
        data[i] = x;
        size = size + 1;
    }

    @SuppressWarnings("unchecked")
    public T removeAt(int i) {
        check(i, size);
        T x = (T) data[i];
        for (int j = i; j < size - 1; j++) {
            data[j] = data[j + 1];
        }
        size = size - 1;
        data[size] = null; // let the garbage collector have the leftover
        shrinkIfSparse();
        return x;
    }

    @SuppressWarnings("unchecked")
    public T removeLast() {
        if (size == 0) {
            throw new NoSuchElementException("array is empty");
        }
        size = size - 1;
        T x = (T) data[size];
        data[size] = null;
        shrinkIfSparse();
        return x;
    }

    @SuppressWarnings("unchecked")
    public T get(int i) {
        check(i, size);
        return (T) data[i];
    }

    public void set(int i, T x) {
        check(i, size);
        data[i] = x;
    }
}
