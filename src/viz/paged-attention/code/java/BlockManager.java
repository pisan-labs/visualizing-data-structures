import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A paged KV cache: a pool of fixed-size blocks, a free list, and a block table per request
 * that maps its logical blocks to physical ones. Only how full each block is matters here; a
 * real cache stores a key and a value per slot.
 */
public class BlockManager {
    final int blockSize, maxLen;
    final boolean sharing;
    final Deque<Integer> free = new ArrayDeque<>(); // a stack: peek() is the top
    final int[] ref;    // how many block tables point at each block
    final int[] filled; // tokens in each block
    final Map<String, List<Integer>> tables = new LinkedHashMap<>(); // oldest first
    final Map<String, Integer> lengths = new LinkedHashMap<>();
    int copies = 0;

    BlockManager(int numBlocks, int blockSize, int maxLen, boolean sharing) {
        this.blockSize = blockSize;
        this.maxLen = maxLen;
        this.sharing = sharing;
        ref = new int[numBlocks];
        filled = new int[numBlocks];
        for (int p = numBlocks - 1; p >= 0; p--) free.push(p);
    }

    private int pop() {
        int p = free.pop();
        ref[p] = 1;
        filled[p] = 0;
        return p;
    }

    /** A request with a prompt of n tokens: one block per blockSize tokens. */
    void add(String name, int n) {
        List<Integer> table = new ArrayList<>();
        for (int start = 0; start < n; start += blockSize) {
            int p = pop();
            filled[p] = Math.min(blockSize, n - start);
            table.add(p);
        }
        tables.put(name, table);
        lengths.put(name, n);
    }

    /** Write one more token. Returns false if no block is free and it must wait. */
    boolean appendToken(String name) {
        List<Integer> table = tables.get(name);
        int k = table.size() - 1, last = table.get(k);
        if (filled[last] == blockSize) { // full: take a new block
            if (free.isEmpty()) return false;
            table.add(pop());
        } else if (ref[last] > 1) { // shared: copy on write
            if (free.isEmpty()) return false;
            int p = pop();
            filled[p] = filled[last]; // copy its keys and values
            ref[last]--;
            table.set(k, p);
            copies++;
        }
        filled[table.get(table.size() - 1)]++;
        lengths.merge(name, 1, Integer::sum);
        return true;
    }

    /** One token for every running request, oldest first. */
    void step() {
        for (String name : tables.keySet())
            if (lengths.get(name) < maxLen) appendToken(name);
    }

    /** Lower each block's count; a block no one uses goes back on the free list. */
    void finish(String name) {
        List<Integer> table = tables.remove(name);
        for (int i = table.size() - 1; i >= 0; i--) { // last first: the first ends on top
            int p = table.get(i);
            if (--ref[p] == 0) free.push(p);
        }
        lengths.remove(name);
    }

    /** Parallel sampling: a second answer to the same prompt. */
    void fork(String parent, String child) {
        List<Integer> table = new ArrayList<>();
        for (int p : tables.get(parent)) {
            if (sharing) { // the same blocks
                ref[p]++;
                table.add(p);
            } else { // a copy of every block
                int q = pop();
                filled[q] = filled[p];
                table.add(q);
                copies++;
            }
        }
        tables.put(child, table);
        lengths.put(child, lengths.get(parent));
    }
}
