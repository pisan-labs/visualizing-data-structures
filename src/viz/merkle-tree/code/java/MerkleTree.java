import java.util.ArrayList;
import java.util.List;

/** A Merkle tree: levels.get(0) are the leaf hashes, the last level is the root. */
public class MerkleTree {
    /** FNV-1a over the characters, folded to 16 bits, as 4 hex digits. A teaching hash only. */
    static String toyHash(String s) {
        int h = 0x811C9DC5;
        for (int k = 0; k < s.length(); k++) {
            h ^= s.charAt(k) & 0xFF;
            h *= 0x01000193; // int arithmetic wraps mod 2^32, as FNV wants
        }
        return String.format("%04x", (h >>> 16) ^ (h & 0xFFFF));
    }

    /** One step of a proof: the sibling's hash and which side it is on. */
    record Item(char side, String hash) {}

    final List<String> blocks;
    final List<List<String>> levels = new ArrayList<>();

    public MerkleTree(List<String> blocks) {
        this.blocks = new ArrayList<>(blocks);
        rebuild();
    }

    private void rebuild() {
        levels.clear();
        if (blocks.isEmpty()) return;
        List<String> level = new ArrayList<>();
        for (String b : blocks) level.add(toyHash(b));
        levels.add(level);
        while (level.size() > 1) {
            List<String> up = new ArrayList<>();
            for (int i = 0; i < level.size(); i += 2)
                up.add(i + 1 < level.size() ? toyHash(level.get(i) + level.get(i + 1)) : level.get(i));
            levels.add(up);
            level = up;
        }
    }

    public String root() { return levels.isEmpty() ? null : levels.get(levels.size() - 1).get(0); }

    /** Rehash only the path from leaf i to the root. */
    public void update(int i, String data) {
        if (i < 0 || i >= blocks.size()) throw new IndexOutOfBoundsException("no such block");
        blocks.set(i, data);
        levels.get(0).set(i, toyHash(data));
        for (int k = 1; k < levels.size(); k++) {
            i /= 2;
            List<String> below = levels.get(k - 1);
            String a = below.get(2 * i);
            levels.get(k).set(i, 2 * i + 1 < below.size() ? toyHash(a + below.get(2 * i + 1)) : a);
        }
    }

    public void append(String data) {
        blocks.add(data);
        rebuild(); // simple; only the right edge really changes
    }

    public List<Item> proof(int i) {
        if (i < 0 || i >= blocks.size()) throw new IndexOutOfBoundsException("no such block");
        List<Item> out = new ArrayList<>();
        for (int k = 0; k < levels.size() - 1; k++) {
            int sib = i ^ 1;
            if (sib < levels.get(k).size()) out.add(new Item(sib < i ? 'L' : 'R', levels.get(k).get(sib)));
            i /= 2;
        }
        return out;
    }

    public static boolean verify(String data, List<Item> proof, String root) {
        String h = toyHash(data);
        for (Item it : proof) h = it.side() == 'L' ? toyHash(it.hash() + h) : toyHash(h + it.hash());
        return h.equals(root);
    }
}
