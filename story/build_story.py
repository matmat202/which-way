#!/usr/bin/env python3
"""site/data/series.json -> site/story/story.json: does unemployment rise the way it falls?

    python3 build_story.py        # BUILD_OUT=... writes elsewhere (publish.sh compares)

Input: the game's own series.json, which publish.sh already proves is what build.py makes of
the frozen FRED/NSIDC CSVs in data/. A "year" is every 12-month window, month m to m+12,
with both ends reported (UNRATE skips October 2025, the shutdown month).

The headline: US unemployment fell in about two years of three, yet the years it rose, it
rose by far more. The control that could kill it: keep every month-to-month move the series
ever made, shuffle their ORDER, and ask again. A shuffle keeps the size of every jump
(April 2020's +11 points included) and loses only the order, so if shuffles look like the
real line, the "slow fall, fast rise" is the jumps, not the economy. Missing months stay
missing; the move across a gap is one move.

The RNG is mulberry32, written out, so the shuffles do not depend on Python's random.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "site", "data", "series.json")
OUT = os.environ.get("BUILD_OUT", os.path.join(HERE, "site", "story", "story.json"))
H = 12            # months
N_UN = 1000       # shuffles of unemployment
N_ALL = 200       # shuffles of every series, for the line-up
SEED = 20261116
HEAD = "UNRATE"


def mulberry32(a):
    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return nxt


def years(v, skip=()):
    """12-month changes, both ends present; skip: indices whose window to drop"""
    return [v[i + H] - v[i] for i in range(len(v) - H)
            if v[i] is not None and v[i + H] is not None and i not in skip]


def shape(ch):
    """-> [share of years up, mean rise, mean fall (positive)], rounded"""
    up = [c for c in ch if c > 1e-9]
    dn = [-c for c in ch if c < -1e-9]
    return [round(len(up) / len(ch), 6), round(sum(up) / len(up), 6), round(sum(dn) / len(dn), 6)]


def shuffles(v, n, rnd):
    idx = [i for i, x in enumerate(v) if x is not None]
    steps = [v[b] - v[a] for a, b in zip(idx, idx[1:])]
    out = []
    for _ in range(n):
        s = steps[:]
        for i in range(len(s) - 1, 0, -1):         # Fisher-Yates
            j = int(rnd() * (i + 1))
            s[i], s[j] = s[j], s[i]
        w = [None] * len(v)
        w[idx[0]] = x = v[idx[0]]
        for k, d in zip(idx[1:], s):
            x += d
            w[k] = x
        out.append(shape(years(w)))
    return out


def ym(start, i):
    y, m = map(int, start.split("-"))
    m += i - 1
    return f"{y + m // 12}-{m % 12 + 1:02d}"


def main():
    S = json.load(open(SRC, encoding="utf-8"))["series"]
    rnd = mulberry32(SEED)
    un = next(s for s in S if s["id"] == HEAD)
    v = un["v"]
    ratio = lambda r: r[1] / r[2]
    med = lambda xs: sorted(xs)[len(xs) // 2]

    real = shape(years(v))
    sh = shuffles(v, N_UN, rnd)
    covid = {i for i in range(len(v) - H) if "2019-04" <= ym(un["start"], i) <= "2021-12"}
    line = []
    for s in S:
        if s["id"] == HEAD:
            r, ss = real, sh[:N_ALL]
        else:
            r, ss = shape(years(s["v"])), shuffles(s["v"], N_ALL, rnd)
        line.append({
            "id": s["id"], "name": s["name"], "real": r,
            "sh_up": med([x[0] for x in ss]), "sh_ratio": round(med([ratio(x) for x in ss]), 6),
            # shuffles at least as lopsided as the real series, both ways at once
            "as_far": sum(x[0] <= r[0] and ratio(x) >= ratio(r) for x in ss)
                      if ratio(r) >= 1 else sum(x[0] >= r[0] and ratio(x) <= ratio(r) for x in ss),
            "n": len(ss),
        })

    check = {
        "up": real[0], "rise": real[1], "fall": real[2],
        "sh_up_med": med([x[0] for x in sh]), "sh_ratio_med": med([ratio(x) for x in sh]),
        "as_low": sum(x[0] <= real[0] for x in sh), "as_high": sum(ratio(x) >= ratio(real) for x in sh),
        "as_far": sum(x[0] <= real[0] and ratio(x) >= ratio(real) for x in sh),
        "n_years": len(years(v)),
    }
    nc = shape(years(v, covid))
    D = {
        "source": "FRED UNRATE and 14 other monthly series (Federal Reserve Bank of St. Louis); NSIDC Sea Ice Index",
        "id": HEAD, "name": un["name"], "start": un["start"], "v": v, "h": H,
        "shuffles": sh, "seed": SEED,
        "nocovid": nc, "covid": ["2019-04", "2021-12"],   # windows starting then touch 2020
        "lineup": line,
        "check": check,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(D, f, separators=(",", ":"), ensure_ascii=False)
    print(json.dumps(check, indent=1))
    print("no covid", nc, round(ratio(nc), 3))
    for r in line:
        print(f"{r['id']:13} up {r['real'][0]:.2f} ratio {ratio(r['real']):.2f}  shuffle {r['sh_up']:.2f} {r['sh_ratio']:.2f}  as_far {r['as_far']}/{r['n']}")


if __name__ == "__main__":
    main()
