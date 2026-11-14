# Test driver: "load w1 w2 ..." replaces the words; "group" prints the groups, each as its
# words joined by commas, groups separated by spaces; "unique w" prints first_unique(w).
import sys

from frequency import first_unique, group_anagrams


def main():
    words = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            words = parts[1:]
        elif cmd == "group":
            print(" ".join(",".join(g) for g in group_anagrams(words)))
        elif cmd == "unique":
            print(first_unique(parts[1]))


main()
