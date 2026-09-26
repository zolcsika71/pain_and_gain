# Pain and Gain Rules

## Overview

You have a pre-set army of 14 `Creeps`. There is no spawning, construction, energy or replacement for destroyed creeps.

Seven neutral `ScoreFlags` are scattered across the map. They start unowned. A flag scores points every tick after you capture it, but also applies a global debuff to your entire army. Controlling more territory gives you a scoring advantage at the cost of combat power.

**Objective: score more points than your opponent, or destroy all their creeps.**

## Capturing Flags and Their Effects

A creep captures a flag by standing on its cell. Each controlled flag grants the listed score per tick and applies its effect to every creep in the owner's army. Effects of the same type stack; different types are independent.

| Flag | Count | Score/tick per flag | Effect | One flag | Two flags |
| --- | --- | --- | --- | --- | --- |
| Vulnerability | 1 | 5 | Incoming combat damage | `x1.1` | - |
| Heal reduction | 2 | 4 | Healing power | `x0.75` | `x0.5` |
| Attack reduction | 2 | 3 | `ATTACK` power | `x0.8` | `x0.6` |
| Ranged attack reduction | 2 | 3 | `RANGED_ATTACK` power | `x0.8` | `x0.6` |

## Time Limit and Match Outcome

The time limit is **2000 ticks**. When it expires, the player with the higher score wins; equal scores result in a draw. The match can end earlier if an army is destroyed or if one player's lead is already mathematically impossible to overcome.

## Sample Code

```javascript
import {getObjectsByPrototype} from 'game/utils';
import {Creep} from 'game/prototypes';
import {ScoreFlag} from 'arena/season_4/pain_and_gain/basic';

export function loop() {
    var flag = getObjectsByPrototype(ScoreFlag)[0];
    var myCreeps = getObjectsByPrototype(Creep).filter(object => object.my);
    for(var creep of myCreeps) {
        creep.moveTo(flag);
    }
}
```
