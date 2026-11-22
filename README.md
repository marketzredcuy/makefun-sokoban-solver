# Push-optimal Sokoban solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/marketzredcuy/makefun-sokoban-solver/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/marketzredcuy/makefun-sokoban-solver/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

A Sokoban solver that answers every level in the fewest pushes possible. On the
kit's practice set it scores the full 1,000,000 (every instance solved in its
push-optimal count P*), while the house baseline, plain-astar, scores 200,000.

## How it works

A level is a hallway with rooms off it, and a box pushed through a door into
the hallway can never be pushed back, so every box stays in its room. The
solver therefore splits the level into rooms and solves each room on its own;
the rooms' push counts add up to the level's optimum.

Inside a room the search is a breadth-first search over pushes: a state is
the boxes' squares plus the player's reachable region, states are expanded in
push order, so the first solved state the search meets is push-optimal. Two
deadlocks are pruned, and neither can prune a solvable state:

- a box on a dead square, one from which no push ever reaches a goal
  (computed by pulling back from the goals);
- a frozen 2x2 block of walls and boxes with a box off its goal.

The player's walk between pushes is the shortest path around walls and
boxes, so the written moves are the pushes joined by short walks.

## Run it

```sh
node main.ts
```

It reads every instance from `MAKEFUN_INPUT_DIR/<id>/level.txt` (or
`/input/<id>/level.txt`) and writes `solution.txt` to
`MAKEFUN_OUTPUT_DIR/<id>/` (or `/output/<id>/`). Node 22 or later,
standard library only, one run of about a second for a whole set of five
levels.

## Files

- `main.ts` — the whole solver: parse, room split, push-optimal search, walks
- `LICENSE` — MIT

## License

MIT. See `LICENSE`.
