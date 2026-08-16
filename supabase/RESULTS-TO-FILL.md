# Match results — fill this in and send it back

Net run rate needs four numbers per innings, and the paper sheets do not give
me all four reliably. Fill in what you know and I will import it exactly.

## Why I am asking rather than reading it off the sheets

I can read some of it. Game 1 clearly shows 11 Fighter making **88** with a
target of **89**, and Canteen Tiger named as the winner. Game 3 shows Eleven
Fighters' overs going `07, 06, 06, 19, 07, 17, 12, 4` — which is **8 overs**,
not the 20 I assumed when creating the tournament.

That last detail is the problem. NRR is runs per over, so guessing the overs
guesses the table. And a wrong points table looks exactly as authoritative as a
right one — nobody opening the app can tell. Two minutes of typing removes the
guess entirely.

## What I need

For each game, per innings: **runs**, **wickets**, **overs faced**.
Overs like `8.3` mean eight overs and three balls.

Leave a game blank if it has not been played.

```
OVERS PER INNINGS FOR THIS TOURNAMENT: ______   (8? 10? 12? 20?)

GROUP A
-------
Game 1  ·  10 Aug  ·  11 Fighter v Canteen Tiger
  11 Fighter      88 / ___ in ___ overs
  Canteen Tiger  ___ / ___ in ___ overs
  Winner: Canteen Tiger

Game 3  ·  15 Aug  ·  11 Fighter v Friends 11
  11 Fighter     ___ / ___ in ___ overs
  Friends 11     ___ / ___ in ___ overs
  Winner: ______________

Game 5  ·  19 Aug  ·  Canteen Tiger v Friends 11
  Canteen Tiger  ___ / ___ in ___ overs
  Friends 11     ___ / ___ in ___ overs
  Winner: ______________

GROUP B
-------
Game 2  ·  12 Aug  ·  Desert XI v Golden Tiger
  Desert XI      ___ / ___ in ___ overs
  Golden Tiger   ___ / ___ in ___ overs
  Winner: ______________

Game 4  ·  17 Aug  ·  Desert XI v Desert Lions
  Desert XI      ___ / ___ in ___ overs
  Desert Lions   ___ / ___ in ___ overs
  Winner: ______________

Game 6  ·  22 Aug  ·  Golden Tiger v Desert Lions
  Golden Tiger   ___ / ___ in ___ overs
  Desert Lions   ___ / ___ in ___ overs
  Winner: ______________
```

## Leading players, if you have them

Optional, and only if the sheets are legible enough for you to read off.
Top scores and best figures make the stats pages worth opening.

```
TOP RUN SCORERS
  Name ______________  Team __________  Runs ____  (in game ____)
  Name ______________  Team __________  Runs ____  (in game ____)
  Name ______________  Team __________  Runs ____  (in game ____)

BEST BOWLING
  Name ______________  Team __________  ___ wickets for ___ runs  (game ____)
  Name ______________  Team __________  ___ wickets for ___ runs  (game ____)
```

## What happens when you send it

I write an import that sets each result, and the points table and net run rate
compute themselves from it — the same views that would have run had every ball
been scored in the app. Nothing is estimated.

## The alternative

If a game has not been played yet, score it in the app instead. You get
ball-by-ball commentary, proper batting and bowling figures, a shareable PDF,
and the table updates itself as the match goes on. The paper sheet becomes the
backup rather than the record.
