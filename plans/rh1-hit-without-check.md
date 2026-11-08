# rh1 - hitting a bystander swings at once

## Goal
Choosing Hit on someone who is not fighting you swings immediately. The "Really hit?"
re-dressed list (and its `confirmed` flag) in `_fireTargetVerb` is removed. What the victim
does back is unchanged.

## Ruling
RHR1, Caelan: no confirmation; if you hit someone you shouldn't, they beat you for it.

## Acceptance
1. Hit on a non-hostile swings at once; no confirmation list appears.
2. Hit still sits at the bottom of the target list (above Cancel).
3. A held Enter or Space that opened the list does not carry through into a swing
   (key repeats are dropped by the key handler).
4. The test drives the list with real arrow and Enter keys.
5. Evidence: 3440x1440 frames of the list and of the swing landing.
6. npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
The victim's reaction, list order, any copy.
