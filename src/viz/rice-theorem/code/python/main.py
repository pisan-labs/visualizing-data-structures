# Test driver: reads one operation per line, prints one result per line.
#   property accepts-A | accepts-eps | nonempty   choose P (and its M_P)
#   build 3 2      M' from M3 and w = <M2> (programs numbered from 1)
#   test AG        prints what M' does on the input: accept, reject or loop
#   decide         prints whether M' has P: yes or no (it does exactly when M halts on w)
import sys

from rice import has_property, m_prime

PROGRAMS = ["A", "G1", "E6>E3>G1A", "?A5?G4RG4A", "?R7E5>G1<G1A", "E4>G1<?A7RA"]
# For each property: M_P, and a word whose acceptance decides P for M' (L(M') is L(M_P) or empty).
PROPERTIES = {"accepts-A": ("A", "A"), "accepts-eps": ("E3RA", ""), "nonempty": ("?A3RA", "A")}


def main():
    m_p, probe = PROPERTIES["accepts-A"]
    machine = None
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "property":
            m_p, probe = PROPERTIES[arg]
        elif op == "build":
            i, j = map(int, arg.split())
            machine = m_prime(PROGRAMS[i - 1], PROGRAMS[j - 1], m_p)
        elif op == "test":
            print(machine("" if arg == "eps" else arg))
        elif op == "decide":
            print("yes" if has_property(machine, probe) else "no")


main()
