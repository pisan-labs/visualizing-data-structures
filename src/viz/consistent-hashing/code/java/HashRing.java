import java.util.TreeMap;

/** Consistent hashing: a key belongs to the first server node clockwise from h(k). */
public class HashRing {
    private static final int RING = 360;
    private static final String NAMES = "ABCDEFGH";

    private final int v;
    /** Nodes by position, then label (ties are rare); the value is the server. */
    private final TreeMap<String, String> nodes = new TreeMap<>();

    public HashRing(int vnodes) {
        this.v = vnodes;
    }

    static int keyPos(int k) {
        return (71 * k + 5) % 1009 % RING;
    }

    static int nodePos(char server, int r) {
        int token = 100 * (NAMES.indexOf(server) + 1) + r;
        return (113 * token + 17) % 1009 % RING;
    }

    /** Sorts by position first: "137:A1" before "172:B2". */
    private static String sortKey(int pos, String label) {
        return String.format("%03d:%s", pos, label);
    }

    public void addServer(char server) {
        for (int r = 0; r < v; r++) {
            String label = v == 1 ? String.valueOf(server) : server + String.valueOf(r + 1);
            nodes.put(sortKey(nodePos(server, r), label), String.valueOf(server));
        }
    }

    public void removeServer(char server) {
        nodes.values().removeIf(s -> s.equals(String.valueOf(server)));
    }

    /** The server that holds k, or null when there are no servers. */
    public String lookup(int k) {
        if (nodes.isEmpty()) return null;
        String at = nodes.ceilingKey(String.format("%03d:", keyPos(k)));
        return nodes.get(at != null ? at : nodes.firstKey()); // past the last node: wrap
    }
}
