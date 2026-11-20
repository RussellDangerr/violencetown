# BP2 - a boon poition thrown at an enemy takes from it for good

Goal: the boon poition that raises your max MP when drunk lowers a hostile enemy's max MP
(and MP) by the same amount when thrown at it, for good.

Acceptance:
- Thrown onto a hostile enemy's tile, it lowers that enemy's max MP and MP by the poition's
  amount, through poitionBuff's flip (no second seam).
- Only the enemy on the impact tile, full amount: no 3x3 burst, no half dose.
- A friendly or empty tile gets nothing; the poition is spent either way.
- The lowered max survives a save and load (the enemy save shape carries maxMp/mp when not default).
- One plain combat-log line says it landed.
- npm test, balance:check, naming grep, autoplay:check pass.

Rests on: BP1 (boon_poition, merged at bc6b33e). Choices flagged on the card: impact tile only,
hostile only.

Out of scope: enemy MP use, any new item, art, player-facing copy beyond one placeholder line.
