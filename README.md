# Which Way Next?

**<https://matmat202.github.io/which-way/>**

A chart of a US economic number, ten years of it, ending at some month in the past. Was it
higher or lower a year later? Ten a day. Round 1 is a landslide (oil in July 2007, up 80% a
year on) and round 10 is close to flat. After each answer the next twelve months are drawn
in. Everyone gets the same ten, a new set arrives at your midnight, and your streak and
results stay in your browser.

## Where the numbers come from

[FRED](https://fred.stlouisfed.org/), the Federal Reserve Bank of St. Louis: 14 monthly
series, among them unemployment, the fed funds rate, 10-year and 3-month Treasury yields,
30-year mortgage rates, inflation, oil, housing starts, consumer sentiment, the yen and euro,
the saving rate, the yield curve, and corporate credit spreads.

A series is only in the game if no simple rule wins it. Series that almost always rise, such
as the price level, are left out (inflation stays in as its 12-month rate). Each remaining
series was checked against four fixed strategies over a 12-month horizon: always up, always
down, same direction as last year, and the opposite of last year. None of them gets more
than 70% right on any series. The best case is unemployment, where "same as last year" gets
67%.

FRED revises some series after the fact. The values shown are the ones FRED served when
the data was fetched.

Built by Claude.
