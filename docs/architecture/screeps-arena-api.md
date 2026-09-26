---
source: "https://arena.screeps.com/docs#"
captured: "2026-09-24T22:15:38+02:00"
---
# Screeps Arena Documentation

## Objects

### `ConstructionSite`

class extends [GameObject](#gameobject)

game/prototypes/game-object

A site of a structure which is currently under construction. To build a structure on the construction site, give a worker creep some amount of energy and perform the [Creep](#creep).[build](#creepbuildtarget) action.

#### `ConstructionSite.my`

boolean

Whether it is your construction site.

#### `ConstructionSite.progress`

number

The current construction progress.

#### `ConstructionSite.progressTotal`

number

The total construction progress needed for the structure to be built.

#### `ConstructionSite.structure`

[Structure](#structure)

The structure that will be built (when the construction site is completed)

#### `ConstructionSite.remove()`

Remove this construction site.

### `CostMatrix`

class 

game/path-finder

Container for custom navigation cost data. If a non-0 value is found in the CostMatrix then that value will be used instead of the default terrain cost.

#### `CostMatrix.clone()`

Copy this [CostMatrix](#costmatrix) into a new [CostMatrix](#costmatrix) with the same data and return new [CostMatrix](#costmatrix)

#### `CostMatrix.constructor()`

Creates a new [CostMatrix](#costmatrix) containing 0's for all positions.

```javascript
import { CostMatrix } from 'game/path-finder';

export function loop() {
    let costs = new CostMatrix;
}
```

#### `CostMatrix.get(x, y)`

Get the cost of a position in this [CostMatrix](#costmatrix).

| parameter | type | description |
| --- | --- | --- |
| x | number | The X position in the game |
| y | number | The Y position in the game |

#### `CostMatrix.set(x, y, cost)`

Set the cost of a position in this [CostMatrix](#costmatrix).

| parameter | type | description |
| --- | --- | --- |
| x | number | The X position in the game |
| y | number | The Y position in the game |
| cost | number | Cost of this position. Must be a whole number. A cost of 0 will use the terrain cost for that tile. A cost greater than or equal to 255 will be treated as unwalkable. |

```javascript
import { CostMatrix } from 'game/path-finder';

export function loop() {
    let costs = new CostMatrix;
    costs.set(constructionSite.x, constructionSite.y, 10); // avoid walking over a construction site
}
```

### `Creep`

class extends [GameObject](#gameobject)

game/prototypes/creep

Creeps are your units. Creeps can move, harvest energy, construct structures, attack another creeps, and perform other actions. Each creep consists of up to 50 body parts with the following possible types:

| body part | cost | Effect per one body part |
| --- | --- | --- |
| [MOVE](#move) | [50](#bodypart_cost) | Decreases fatigue by 2 points per tick. |
| [WORK](#work) | [100](#bodypart_cost) | Harvests 2 energy units from a source per tick.  Builds a structure for 5 energy units per tick. |
| [CARRY](#carry) | [50](#bodypart_cost) | Can contain up to 50 resource units. |
| [ATTACK](#attack) | [80](#bodypart_cost) | Attacks another creep/structure with 30 hits per tick in a short-ranged attack. |
| [RANGED\_ATTACK](#ranged_attack) | [150](#bodypart_cost) | Attacks another single creep/structure with 10 hits per tick in a long-range attack up to 3 squares long.  Attacks all hostile creeps/structures within 3 squares range with 1-4-10 hits (depending on the range). |
| [HEAL](#heal) | [250](#bodypart_cost) | Heals self or another creep restoring 12 hits per tick in short range or 4 hits per tick at a distance. |
| [TOUGH](#tough) | [10](#bodypart_cost) | No effect, just additional hit points to the creep's body. |

#### `Creep.body`

array

An array describing the creep’s body. Each element contains the following properties:

| type | string | One of the body part types constants. |
| --- | --- | --- |
| hits | number | The remaining amount of hit points of this body part. |

#### `Creep.fatigue`

number

The movement fatigue indicator. If it is greater than zero, the creep cannot move.

#### `Creep.hits`

number

The current amount of hit points of the creep.

#### `Creep.hitsMax`

number

The maximum amount of hit points of the creep.

#### `Creep.my`

boolean

Whether it is your creep.

#### `Creep.spawning`

boolean

Whether this creep is still being spawned.

#### `Creep.store`

[Store](#store)

A [Store](#store) object that contains cargo of this creep.

#### `Creep.attack(target)`

Attack another creep, structure, or construction site in a short-ranged attack. Requires the [ATTACK](#attack) body part. If the target is inside a rampart, then the rampart is attacked instead. The target has to be at adjacent square to the creep. This action cannot be executed on the same tick with [harvest](#creepharvesttarget), [build](#creepbuildtarget), [heal](#creephealtarget), [rangedHeal](#creeprangedhealtarget).

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep)  [Structure](#structure)  [ConstructionSite](#constructionsite) | The target object. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid attackable object. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no ATTACK body parts in this creep’s body. |

```javascript
let hostileCreeps = getObjectsByPrototype(Creep).filter(i => !i.my);
let target = creep.findClosestByRange(hostileCreeps);
if (target){
    creep.move(target);
    creep.attack(target);
}
```

#### `Creep.build(target)`

Build a structure at the target construction site using carried energy. Requires [WORK](#work) and [CARRY](#carry) body parts. The target has to be within 3 squares range of the creep. This action cannot be executed on the same tick with [harvest](#creepharvesttarget), [attack](#creepattacktarget), [heal](#creephealtarget), [rangedHeal](#creeprangedhealtarget), [rangedAttack](#creeprangedattacktarget), [rangedMassAttack](#creeprangedmassattack).

| parameter | type | description |
| --- | --- | --- |
| target | [ConstructionSite](#constructionsite) | The target construction site to be built. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_NOT\_ENOUGH\_RESOURCES](#err_not_enough_resources) | \-6 | The creep does not have any carried energy. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid construction site object or the structure cannot be built here (probably because of an obstacle at the same square). |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_FULL](#err_full) | \-8 | There is another construction site at the same location that's further along. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no WORK body parts in this creep’s body. |

```javascript
let myConstructionSites = getObjectsByPrototype(ConstructionSite).filter(i => i.my);
let target = creep.findClosestByRange(myConstructionSites);
if (target) {
    if (creep.build(target) == ERR_NOT_IN_RANGE) {
        creep.move(target);
    }
}
```

#### `Creep.drop(resourceType, [amount])`

Drop this resource on the ground.

| parameter | type | description |
| --- | --- | --- |
| resourceType | string | One of the RESOURCE\_\* constants. |
| amount (optional) | number | The amount of resource units to be dropped. If omitted, all the available carried amount is used. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_NOT\_ENOUGH\_RESOURCES](#err_not_enough_resources) | \-6 | The creep does not have the given amount of resources. |
| [ERR\_INVALID\_ARGS](#err_invalid_args) | \-10 | The resourceType is not a valid RESOURCE\_\* constant. |

```javascript
creep.drop(RESOURCE_ENERGY);
```

#### `Creep.harvest(target)`

Harvest energy from the source. Requires the [WORK](#work) body part. If the creep has an empty [CARRY](#carry) body part, the harvested resource is put into it; otherwise it is dropped on the ground. The target has to be at an adjacent square to the creep. This action cannot be executed on the same tick with [attack](#creepattacktarget), [build](#creepbuildtarget), [heal](#creephealtarget), [rangedHeal](#creeprangedhealtarget).

| parameter | type | description |
| --- | --- | --- |
| target | [Source](#source) | The object to be harvested. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_NOT\_ENOUGH\_RESOURCES](#err_not_enough_resources) | \-6 | The target does not contain any harvestable resource. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid source object. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no WORK body parts in this creep’s body. |

```javascript
let activeSources = getObjectsByPrototype(Source).filter(i => i.energy > 0);
let source = creep.findClosestByRange(activeSources);
if(source){
    if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
        creep.move(source);
    }
}
```

#### `Creep.heal(target)`

Heal self or another creep. It will restore the target creep’s damaged body parts function and increase the hits counter. Requires the [HEAL](#heal) body part. The target has to be at adjacent square to the creep. This action cannot be executed on the same tick with [harvest](#creepharvesttarget), [build](#creepbuildtarget), [attack](#creepattacktarget), [rangedHeal](#creeprangedhealtarget).

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep) | The target creep object. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid creep object. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no HEAL body parts in this creep’s body. |

```javascript
let creeps = getObjectsByPrototype(Creep);
let myDamagedCreeps = creeps.filter(i => i.my && i.hits < i.hitsMax);
let target = tower.findClosestByRange(myDamagedCreeps);
if (creep.heal(target) == ERR_NOT_IN_RANGE) {
    creep.moveTo(target);
}
```

#### `Creep.move(direction)`

Move the creep one square in the specified direction. Requires the [MOVE](#move) body part.

| parameter | type | description |
| --- | --- | --- |
| direction | number | one of the following constants:   [TOP](#top) [TOP\_RIGHT](#top_right) [RIGHT](#right) [BOTTOM\_RIGHT](#bottom_right) [BOTTOM](#bottom) [BOTTOM\_LEFT](#bottom_left) [LEFT](#left) [TOP\_LEFT](#top_left) |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_INVALID\_ARGS](#err_invalid_args) | \-10 | The provided direction is incorrect. |
| [ERR\_TIRED](#err_tired) | \-11 | The fatigue indicator of the creep is non-zero. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no MOVE body parts in this creep’s body. |

```javascript
creep.move(RIGHT);
```

#### `Creep.moveTo(target, opts)`

Find the optimal path to the target and move to it. Requires the [MOVE](#move) body part.

| parameter | type | description |
| --- | --- | --- |
| target | object | Can be a [GameObject](#gameobject) or any object containing x and y properties. |
| opts | object | An object with additional options that are passed to game/utils [findPath](#findpathfrompos-topos-opts). |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_TIRED](#err_tired) | \-11 | The fatigue indicator of the creep is non-zero. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no MOVE body parts in this creep’s body. |

```javascript
creep1.moveTo(creep2);
creep2.moveTo({x: 50, y: 50});
```

#### `Creep.pickup(target)`

Pick up an item (a dropped piece of resource). Requires the [CARRY](#carry) body part. The target has to be at adjacent square to the creep or at the same square.

| parameter | type | description |
| --- | --- | --- |
| target | [Resource](#resource) | The target object to be picked up. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid creep object. |
| [ERR\_FULL](#err_full) | \-8 | The creep cannot receive any more resource. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |

```javascript
let resources = getObjectsByPrototype(Resource);
let target = creep.findClosestByRange(resources);
if (target) {
    if (creep.pickup(target) == ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
    }
}
```

#### `Creep.pull(target)`

Help another creep to follow this creep. The fatigue generated for the target's move will be added to the creep instead of the target. Requires the [MOVE](#move) body part. The target has to be at adjacent square to the creep. The creep must move elsewhere, and the target must move towards the creep.

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep) | The target creep. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid creep object. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |

```javascript
creep1.move(TOP);
creep1.pull(creep2);
creep2.moveTo(creep1);
```

#### `Creep.rangedAttack(target)`

A ranged attack against another creep or structure. Requires the [RANGED\_ATTACK](#ranged_attack) body part. If the target is inside a rampart, the rampart is attacked instead. The target has to be within 3 squares range of the creep. This action cannot be executed on the same tick with [rangedMassAttack](#creeprangedmassattack), [rangedHeal](#creeprangedhealtarget), [build](#creepbuildtarget).

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep)  [Structure](#structure) | The target object to be attacked up. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid attackable object. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no [RANGED\_ATTACK](#ranged_attack) body parts in this creep’s body. |

```javascript
let hostileCreeps = getObjectsByPrototype(Creep).filter(i => !i.my);
let targets = creep.findInRange(hostileCreeps);
if (targets.length) {
    creep.rangedAttack(targets[0]);
}
```

#### `Creep.rangedHeal(target)`

Heal another creep at a distance. It will restore the target creep’s damaged body parts function and increase the hits counter. Requires the [HEAL](#heal) body part. The target has to be within 3 squares range of the creep. This action cannot be executed on the same tick with [harvest](#creepharvesttarget), [build](#creepbuildtarget), [heal](#creephealtarget), [attack](#creepattacktarget), [rangedAttack](#creeprangedattacktarget), [rangedMassAttack](#creeprangedmassattack).

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep) | The target creep object. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid attackable object. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no [HEAL](#heal) body parts in this creep’s body. |

```javascript
let creeps = getObjectsByPrototype(Creep);
let myDamagedCreeps = creeps.filter(i => i.my && i.hits < i.hitsMax);
let targets = creep.findInRange(myDamagedCreeps);
if (targets.length) {
    creep.rangedHeal(targets[0]);
}
```

#### `Creep.rangedMassAttack()`

A ranged attack against all hostile creeps or structures within 3 squares range. Requires the [RANGED\_ATTACK](#ranged_attack) body part. The attack power depends on the range to each target. Friendly units are not affected. This action cannot be executed on the same tick with [rangedAttack](#creeprangedattacktarget), [rangedHeal](#creeprangedhealtarget), [build](#creepbuildtarget).

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_NO\_BODYPART](#err_no_bodypart) | \-12 | There are no [RANGED\_ATTACK](#ranged_attack) body parts in this creep’s body. |

#### `Creep.transfer(target, resourceType, [amount])`

Transfer resource from the creep to another object. The target has to be at adjacent square to the creep.

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep)  [Structure](#structure) | The target object. |
| resourceType | string | One of the RESOURCE\_\* constants. |
| amount (optional) | number | The amount of resources to be transferred. If omitted, all the available carried amount is used. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_NOT\_ENOUGH\_RESOURCES](#err_not_enough_resources) | \-6 | The creep does not have the given amount of resources. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid object which can contain the specified resource. |
| [ERR\_FULL](#err_full) | \-8 | The target cannot receive any more resources. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_INVALID\_ARGS](#err_invalid_args) | \-10 | The resourceType is not one of the RESOURCE\_\* constants, or the amount is incorrect. |

```javascript
if (creep.transfer(tower, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    creep.moveTo(tower);
}
```

#### `Creep.withdraw(target, resourceType, [amount])`

Withdraw resources from a structure. The target has to be at adjacent square to the creep. Multiple creeps can withdraw from the same object in the same tick. Your creeps can withdraw resources from hostile structures as well, in case if there is no hostile rampart on top of it.

| parameter | type | description |
| --- | --- | --- |
| target | [Structure](#structure) | The target structure. |
| resourceType | string | One of the RESOURCE\_\* constants. |
| amount (optional) | number | The amount of resources to be transferred. If omitted, all the available carried amount is used. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this creep. |
| [ERR\_NOT\_ENOUGH\_RESOURCES](#err_not_enough_resources) | \-6 | The target does not have the given amount of resources. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The target is not a valid object which can contain the specified resource. |
| [ERR\_FULL](#err_full) | \-8 | The creep's store is full. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is too far away. |
| [ERR\_INVALID\_ARGS](#err_invalid_args) | \-10 | The resourceType is not one of the RESOURCE\_\* constants, or the amount is incorrect. |

```javascript
if (creep.withdraw(container, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
    creep.moveTo(container);
}
```

### `Flag`

class extends [GameObject](#gameobject)

game/prototypes/flag

A flag is a game object that control other objects.

#### `Flag.my`

boolean

Equals to true or false if the flag is owned. Returns undefined if it is neutral.

### `GameObject`

class 

game/prototypes/game-object

Basic prototype for game objects. All objects and classes are inherited from this class.

#### `GameObject.controlledBy`

[Flag](#flag)

Returns the flag object that controls this game object.

#### `GameObject.exists`

boolean

Returns true if this object is live in the game at the moment. Check this property to verify cached or newly created object instances.

#### `GameObject.id`

string

The unique ID of this object that you can use in game/utils [getObjectById](#getobjectbyidid).

#### `GameObject.ticksToDecay`

number

If defined, then this object will disappear after this number of ticks.

#### `GameObject.x`

number

The X coordinate in the room.

#### `GameObject.y`

number

The Y coordinate in the room.

#### `GameObject.findClosestByPath(positions, [opts])`

Find a position with the shortest path from this game object. (See game/utils [findClosestByPath](#findclosestbypathfrompos-positions-opts).)

| parameter | type | description |
| --- | --- | --- |
| positions | array | The positions to search among. An array with [GameObject](#gameobject)s or any objects containing x and y properties. |
| opts (optional) | object | An object containing additional pathfinding flags supported by [searchPath](#searchpathorigin-goal-opts) method. |

Returns the closest object from **positions**, or null if there was no valid positions.

#### `GameObject.findClosestByRange(positions)`

Find a position with the shortest linear distance from this game object. (See game/utils [findClosestByRange](#findclosestbyrangefrompos-positions)).

| parameter | type | description |
| --- | --- | --- |
| positions | array | The positions to search among. An array with [GameObject](#gameobject)s or any objects containing x and y properties. |

Returns the closest object from **positions**.

#### `GameObject.findInRange(positions, range)`

Find all objects in the specified linear range. See game/utils [findInRange](#findinrangefrompos-positions-range).

| parameter | type | description |
| --- | --- | --- |
| positions | array | The positions to search. An array with [GameObject](#gameobject)s or any objects containing x and y properties. |
| range | number | The range distance. |

Returns an array with the objects found.

#### `GameObject.findPathTo(pos, [opts])`

Find a path from this object to the given position.

| parameter | type | description |
| --- | --- | --- |
| pos | object | An object containing **x** and **y**. |
| opts (optional) | object | An object with additional options that are passed to game/utils [findPath](#findpathfrompos-topos-opts). |

Returns the path found as an array of objects containing x and y properties

```javascript
let path = creep.findPathTo(spawn);
console.log(path.length);
```

#### `GameObject.getRangeTo(pos)`

See game/utils [getRange](#getrangea-b).

| parameter | type | description |
| --- | --- | --- |
| pos | object | An object containing **x** and **y**. |

### `OwnedStructure`

class extends [Structure](#structure)

game/prototypes/owned-structure

The base prototype for a structure that has an owner.

```javascript
import { getObjectsByPrototype } from 'game/utils';
import { Creep, StructureSpawn } from 'game/prototypes';

export function loop() {
    let target = getObjectsByPrototype(StructureSpawn).find(i => !i.my);
}
```

#### `OwnedStructure.my`

boolean

Returns true for your structure, false for a hostile structure, undefined for a neutral structure.

### `Resource`

class extends [GameObject](#gameobject)

game/prototypes/resource

A dropped piece of resource. It will decay after a while if not picked up. Dropped resource pile decays for ceil(amount/1000) units per tick.

#### `Resource.amount`

number

The amount of dropped resource.

#### `Resource.resourceType`

string

One of the RESOURCE\_\* constants.

### `Source`

class extends [GameObject](#gameobject)

game/prototypes/source

An energy source object. Can be harvested by creeps with a [WORK](#work) body part.

| Energy amount | 1000 |
| --- | --- |
| Energy regeneration | 10 energy per tick |

#### `Source.energy`

number

Current amount of energy in the source.

#### `Source.energyCapacity`

number

The maximum amount of energy in the source.

### `Spawning`

object 

game/prototypes/spawn

Details of the creep being spawned currently that can be addressed by the [StructureSpawn.spawning](#creepspawning) property.

#### `Spawning.creep`

[Creep](#creep)

The creep that being spawned.

#### `Spawning.needTime`

number

Time needed in total to complete the spawning.

#### `Spawning.remainingTime`

number

Remaining time to go.

#### `Spawning.cancel()`

Cancel spawning immediately. Energy spent on spawning is not returned.

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this spawn. |

### `Store`

object 

game/prototypes/store

An object that class contain resources in its cargo.

There are two types of stores in the game: general-purpose stores and limited stores.

- General purpose stores can contain any resource within their capacity (e.g. creeps or containers).
- Limited stores can contain only a few types of resources needed for that particular object (e.g. spawns, extensions, towers).

You can get specific resources from the store by addressing them as object properties:

```javascript
console.log(creep.store[RESOURCE_ENERGY]);
```

#### `Store.getCapacity([resource])`

Returns capacity of this store for the specified resource. For a general-purpose store, it returns total capacity if resource is undefined.

| parameter | type | description |
| --- | --- | --- |
| resource (optional) | [RESOURCE\_ENERGY](#resource_energy) |  |

```javascript
if (creep.store[RESOURCE_ENERGY] < creep.store.getCapacity()) {
    creep.harvest(source);
}
```

#### `Store.getFreeCapacity([resource])`

Returns free capacity for the store. For a limited store, it returns the capacity available for the specified resource if resource is defined and valid for this store.

| parameter | type | description |
| --- | --- | --- |
| resource (optional) | [RESOURCE\_ENERGY](#resource_energy) |  |

```javascript
if (tower.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    creep.transfer(tower, RESOURCE_ENERGY);
}
```

#### `Store.getUsedCapacity([resource])`

Returns the capacity used by the specified resource. For a general-purpose store, it returns total used capacity if resource is undefined.

| parameter | type | description |
| --- | --- | --- |
| resource (optional) | [RESOURCE\_ENERGY](#resource_energy) |  |

```javascript
if (container.store.getUsedCapacity() == 0) {
    // the container is empty
}
```

### `Structure`

class extends [GameObject](#gameobject)

game/prototypes/structure

The base prototype object of all structures.

```javascript
import { getObjectsByPrototype } from 'game/utils';
import { Structure } from 'game/prototypes';

export function loop() {
    let structures = getObjectsByPrototype(Structure).filter(i => i.hits < i.hitsMax);
    console.log(structures.length);
}
```

#### `Structure.hits`

number

The current amount of hit points of the structure.

#### `Structure.hitsMax`

number

The maximum amount of hit points of the structure.

### `StructureContainer`

class extends [OwnedStructure](#ownedstructure)

game/prototypes/container

A small container that can be used to store resources. This is a walkable structure. All dropped resources automatically goes to the container at the same tile.

| capacity | 2000 |
| --- | --- |
| cost | 100 |
| hits | 300 |

#### `StructureContainer.store`

Store

A [Store](#store) object that contains cargo of this structure.

### `StructureExtension`

class extends [OwnedStructure](#ownedstructure)

game/prototypes/extension

Contains energy that can be spent on spawning bigger creeps. Extensions can be placed anywhere, any spawns will be able to use them regardless of distance.

| cost | 200 |
| --- | --- |
| hits | 100 |
| capacity | 100 |

```javascript
let allExtensions = getObjectsByPrototype(StructureExtension);
let myEmptyExtensions = allExtensions.filter(e => e.my && e.store.getUsedCapacity(RESOURCE_ENERGY) == 0)
let closestEmptyExtension = creep.findClosestByRange(myEmptyExtensions);
creep.moveTo(closestEmptyExtension);
```

#### `StructureExtension.store`

[Store](#store)

A [Store](#store) object that contains cargo of this structure.

### `StructureRampart`

class extends [OwnedStructure](#ownedstructure)

game/prototypes/rampart

Blocks movement of hostile creeps, and defends your creeps and structures on the same position.

| cost | 200 |
| --- | --- |
| hits | 10000 |

### `StructureRoad`

class extends [Structure](#structure)

game/prototypes/road

Decreases movement cost to 1. Using roads allows creating creeps with less [MOVE](#move) body parts.

| cost | - 10 on plain land - 50 on swamp |
| --- | --- |
| hits | - 500 on plain land - 2500 on swamp |

### `StructureSpawn`

class extends [OwnedStructure](#ownedstructure)

game/prototypes/spawn

This structure can create creeps. It also auto-regenerate a little amount of energy each tick.

| cost | 1000 |
| --- | --- |
| hits | 3000 |
| capacity | 1000 |
| Spawn time | 3 ticks per each body part |

#### `StructureSpawn.directions`

array\<number>

An array with the direction constants:[TOP](#top) [TOP\_RIGHT](#top_right) [RIGHT](#right) [BOTTOM\_RIGHT](#bottom_right) [BOTTOM](#bottom) [BOTTOM\_LEFT](#bottom_left) [LEFT](#left) [TOP\_LEFT](#top_left) 

#### `StructureSpawn.spawning`

[Spawning](#spawning)

If the spawn is in process of spawning a new creep, this object will contain a [Spawning](#spawning) object, or null otherwise.

#### `StructureSpawn.store`

[Store](#store)

A [Store](#store) object that contains cargo of this structure.

#### `StructureSpawn.setDirections(directions)`

Set desired directions where creeps should move when spawned.

| parameter | type | description |
| --- | --- | --- |
| directions | array\<number> | An array with the direction constants:[TOP](#top) [TOP\_RIGHT](#top_right) [RIGHT](#right) [BOTTOM\_RIGHT](#bottom_right) [BOTTOM](#bottom) [BOTTOM\_LEFT](#bottom_left) [LEFT](#left) [TOP\_LEFT](#top_left) |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this structure. |
| [ERR\_INVALID\_ARGS](#err_invalid_args) | \-10 | The array contains invalid directions. |

```javascript
import { getObjectsByPrototype } from 'game/utils';
import { StructureSpawn } from 'game/prototypes';

export function loop() {
    const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
    mySpawn.setDirections([TOP, TOP_RIGHT, RIGHT]);
}
```

#### `StructureSpawn.spawnCreep(body)`

Start the creep spawning process. The required energy amount can be withdrawn from your spawns and extensions within [SPAWN\_RANGE](#spawn_range) range.

| parameter | type | description |
| --- | --- | --- |
| body | array\<string> | An array describing the new creep’s body. Should contain 1 to 50 elements with one of these constants: [WORK](#work) [MOVE](#move) [CARRY](#carry) [ATTACK](#attack) [RANGED\_ATTACK](#ranged_attack) [HEAL](#heal) [TOUGH](#tough) |

Return an object with one of the following properties:

| error | number | One of the ERR\_\* constants |
| --- | --- | --- |
| object | [Creep](#creep) | Instance of the creep being spawned |

  
Possible error codes:

| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this structure. |
| --- | --- | --- |
| [ERR\_BUSY](#err_busy) | \-4 | The spawn is already in process of spawning another creep. |
| [ERR\_NOT\_ENOUGH\_ENERGY](#err_not_enough_energy) | \-6 | The spawn and its extensions contain not enough energy to create a creep with the given body. |
| [ERR\_INVALID\_ARGS](#err_invalid_args) | \-10 | Body is not properly described. |

```javascript
import { getObjectsByPrototype } from 'game/utils';
import { StructureSpawn } from 'game/prototypes';

export function loop() {
    const mySpawn = getObjectsByPrototype(StructureSpawn).find(s => s.my);
    const creep = mySpawn.spawnCreep([WORK, CARRY, MOVE]).object;
}
```

### `StructureTower`

class extends [OwnedStructure](#ownedstructure)

game/prototypes/tower

Remotely attacks game objects or heals creeps within its range. Its effectiveness linearly depends on the distance. Each action consumes energy.

| cost | 1250 |
| --- | --- |
| hits | 3000 |
| capacity | 10 |
| cooldown | 10 ticks |
| Action maximum range | 20 |
| Energy per action | 10 |
| Attack effectiveness | Starts at 1000 at point-blank range and decreases by 50 for each additional tile |
| Heal effectiveness | Starts at 600 at point-blank range and decreases by 30 for each additional tile |

#### `StructureTower.cooldown`

number

The remaining amount of ticks while this tower cannot be used.

#### `StructureTower.store`

[Store](#store)

A [Store](#store) object that contains cargo of this structure.

#### `StructureTower.attack(target)`

Remotely attack any creep or structure in range.

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep)  [Structure](#structure) | The target object. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this structure. |
| [ERR\_NOT\_ENOUGH\_ENERGY](#err_not_enough_energy) | \-6 | The tower does not have enough energy. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The arguments provided are incorrect. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is not in range. |
| [ERR\_TIRED](#err_tired) | \-11 | The tower is still cooling down. |

```javascript
import { getObjectsByPrototype } from 'game/utils';
import { Creep } from 'game/prototypes';
import { TOWER_RANGE } from 'game/constants';

export function loop() {
    let target = tower.findClosestByRange(getObjectsByPrototype(Creep).filter(i => !i.my));
    if (tower.getRangeTo(target) <= TOWER_RANGE) {
        tower.attack(target);
    }
}
```

#### `StructureTower.heal(target)`

Remotely heal any creep in range.

| parameter | type | description |
| --- | --- | --- |
| target | [Creep](#creep) | The target creep. |

Return one of the following codes:

| [OK](#ok) | 0 | The operation has been scheduled successfully. |
| --- | --- | --- |
| [ERR\_NOT\_OWNER](#err_not_owner) | \-1 | You are not the owner of this structure. |
| [ERR\_NOT\_ENOUGH\_ENERGY](#err_not_enough_energy) | \-6 | The tower does not have enough energy. |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The arguments provided are incorrect. |
| [ERR\_NOT\_IN\_RANGE](#err_not_in_range) | \-9 | The target is not in range. |
| [ERR\_TIRED](#err_tired) | \-11 | The tower is still cooling down. |

```javascript
let creeps = getObjectsByPrototype(Creep);
let myDamagedCreeps = creeps.filter(i => i.my && i.hits < i.hitsMax);
let target = tower.findClosestByRange(myDamagedCreeps);
if (creep.heal(target) == ERR_NOT_IN_RANGE) {
    creep.moveTo(target);
}
```

### `StructureWall`

class extends [Structure](#structure)

game/prototypes/wall

Blocks movement of all creeps.

| cost | 100 |
| --- | --- |
| hits | 10000 |

### `Visual`

class 

game/visual

Visuals provide a way to show various visual debug info in the game. All draw coordinates are measured in game coordinates and centered to tile centers, i.e. (10,10) will point to the center of the creep at x:10; y:10 position. Fractional coordinates are allowed.

#### `Visual.layer`

number

The layer of visuals in the object.

#### `Visual.persistent`

boolean

Whether visuals in this object are persistent.

#### `Visual.circle(pos, [style])`

game/visual

Draw a circle.

| parameter | type | description |
| --- | --- | --- |
| pos | object | The position object of the center. May be **GameObject** or any object containing x and y properties. |
| style (optional) | object | An object with the following properties: - radius (number) Circle radius, default is 0.15. - fill (string) Fill color in the following format: #ffffff (hex triplet). Default is #ffffff. - opacity (number) Opacity value, default is 0.5. - stroke (string) Stroke color in the following format: #ffffff (hex triplet). Default is #ffffff. - strokeWidth (number) Stroke line width, default is 0.1. - lineStyle (string) Either undefined (solid line), dashed, or dotted. Default is undefined. |

Returns the [Visual](#visual) object itself, so that you can chain calls.

#### `Visual.clear()`

Remove all visuals from the object.

Returns the [Visual](#visual) object itself, so that you can chain calls.

#### `Visual.constructor([layer], persistent)`

Creates a new empty instance of [Visual](#visual).

| parameter | type | description |
| --- | --- | --- |
| layer (optional) | number | The layer of visuals in this object. Visuals of higher layer overlaps visuals of lower layer. Default is 0. |
| persistent | boolean | Whether visuals in this object are persistent. Non-persistent visuals are visible during the current tick only. |

```javascript
for(const creep of creeps) {
    if(!creep.hitsVisual) {
        creep.hitsVisual = new Visual(10, true);
    }
    creep.hitsVisual.clear().text(
        creep.hits,
        { x: creep.x, y: creep.y - 0.5 }, // above the creep
        {
            font: '0.5',
            opacity: 0.7,
            backgroundColor: '#808080',
            backgroundPadding: '0.03'
        });
}
```

#### `Visual.line(pos1, pos2, [style])`

game/visual

Draw a line.

| parameter | type | description |
| --- | --- | --- |
| pos1 | object | The start position object. May be **GameObject** or any object containing x and y properties. |
| pos2 | object | The finish position object. May be **GameObject** or any object containing x and y properties. |
| style (optional) | object | An object with the following properties: - width (number) Line width, default is 0.1. - color (string) Line color in the following format: #ffffff (hex triplet). Default is #ffffff. - opacity (number) Opacity value, default is 0.5. - lineStyle (string) Either undefined (solid line), dashed, or dotted. Default is undefined. |

Returns the [Visual](#visual) object itself, so that you can chain calls.

```javascript
new Visual().line({x: 1, y: 99}, {x: 99, y: 1}, {color: '#ff0000'});
new Visual().line(creep, tower, {lineStyle: 'dashed'});
```

#### `Visual.poly(points, [style])`

game/visual

Draw a polyline.

| parameter | type | description |
| --- | --- | --- |
| points | array | An array of points. Every item may be **GameObject** or any object containing x and y properties. |
| style (optional) | object | An object with the following properties: - fill (string) Fill color in the following format: #ffffff (hex triplet). Default is #ffffff. - opacity (number) Opacity value, default is 0.5. - stroke (string) Stroke color in the following format: #ffffff (hex triplet). Default is #ffffff. - strokeWidth (number) Stroke line width, default is 0.1. - lineStyle (string) Either undefined (solid line), dashed, or dotted. Default is undefined. |

Returns the [Visual](#visual) object itself, so that you can chain calls.

#### `Visual.rect(pos, w, h, [style])`

game/visual

Draw a rectangle.

| parameter | type | description |
| --- | --- | --- |
| pos | object | The position object of the top-left corner. May be **GameObject** or any object containing x and y properties. |
| w | number | The width of the rectangle. |
| h | number | The height of the rectangle. |
| style (optional) | object | An object with the following properties: - fill (string) Fill color in the following format: #ffffff (hex triplet). Default is #ffffff. - opacity (number) Opacity value, default is 0.5. - stroke (string) Stroke color in the following format: #ffffff (hex triplet). Default is #ffffff. - strokeWidth (number) Stroke line width, default is 0.1. - lineStyle (string) Either undefined (solid line), dashed, or dotted. Default is undefined. |

Returns the [Visual](#visual) object itself, so that you can chain calls.

#### `Visual.size()`

Get the stored size of all visuals stored in the object.

Returns the size of the visuals in bytes.

#### `Visual.text(text, pos, [style])`

game/visual

Draw a text label. You can use any valid Unicode characters, including emoji.

| parameter | type | description |
| --- | --- | --- |
| text | string | The text message. |
| pos | object | The position object of the label baseline. May be GameObject or any object containing x and y properties. |
| style (optional) | object | An object with the following properties: - color (string) Font color in the following format: #ffffff (hex triplet). Default is #ffffff. - font (number\|string) Either a number or a string in one of the following forms: "0.7" (relative size in game coordinates), "20px" (absolute size in pixels), "0.7 serif", or "bold italic 1.5 Times New Roman" - stroke (string) Stroke color in the following format: #ffffff (hex triplet). default is undefined (no stroke). - strokeWidth (number) Stroke line width, default is 0.15. - backgroundColor (string) Background color in the following format: #ffffff (hex triplet). Default is undefined (no background). When background is enabled, text vertical align is set to middle (default is baseline). - backgroundPadding (number) Background rectangle padding, default is 0.3. - aling (string) Text align, either center, left, or right. Default is center. - opacity (number) Opacity value, default is 1. |

The [Visual](#visual) object itself, so that you can chain calls.

### `arenaInfo`

object 

game

```javascript
import { arenaInfo } from 'game';
export function loop() {
    console.log(arenaInfo.name);
}
```

#### `arenaInfo.cpuTimeLimit`

number

CPU wall time execution limit per one tick (except the first tick).

#### `arenaInfo.cpuTimeLimitFirstTick`

number

CPU wall time limit on the first tick.

#### `arenaInfo.level`

number

Currently equals to 1 for basic arena and 2 for advanced.

#### `arenaInfo.name`

string

The name of the arena.

#### `arenaInfo.season`

string

The name of the season this arena belongs.

#### `arenaInfo.ticksLimit`

number

Game ticks limit.

## Functions

### `createConstructionSite(position, prototype)`

game/utils

Create new [ConstructionSite](#constructionsite) at the specified location.

| parameter | type | description |
| --- | --- | --- |
| position | object | An object with x and y properties. |
| prototype | class | A prototype that extends [Structure](#structure). |

Returns an object with one of the following properties:

| error | number | one of the ERR\_\* constants |
| --- | --- | --- |
| object | [ConstructionSite](#constructionsite) | the instance of [ConstructionSite](#constructionsite) created by this call |

Possible error codes:

| [ERR\_INVALID\_ARGS](#err_invalid_args) | \-10 | The location or the structure prototype is incorrect. |
| --- | --- | --- |
| [ERR\_INVALID\_TARGET](#err_invalid_target) | \-7 | The structure cannot be placed at the specified location. |
| [ERR\_FULL](#err_full) | \-8 | You have too many construction sites. The maximum number of construction sites per player is 10. |

### `findClosestByPath(fromPos, positions, [opts])`

game/utils

Find a position with the shortest path from the given position.

| parameter | type | description |
| --- | --- | --- |
| fromPos | object | The position to search from. May be [GameObject](#gameobject) or any object containing x and y properties. |
| positions | array | The positions to search among. An array with [GameObject](#gameobject)s or any objects containing x and y properties. |
| opts (optional) | object | An object containing additional pathfinding flags supported by **searchPath** method. |

The closest object if found, null otherwise.

```javascript
let targets = getObjectsByPrototype(Creep).filter(c => !c.my);
let closestTarget = findClosestByPath(creep, targets);
creep.moveTo(closestTarget);
creep.attack(closestTarget);
```

### `findClosestByRange(fromPos, positions)`

game/utils

Find a position with the shortest linear distance from the given position.

| parameter | type | description |
| --- | --- | --- |
| fromPos | object | The position to search from. May be [GameObject](#gameobject) or any object containing x and y properties. |
| positions | array | The positions to search among. An array with [GameObject](#gameobject)s or any objects containing x and y properties. |

Returns the closest object from **positions**, or null if there was no valid positions.

```javascript
let targets = getObjectsByPrototype(Creep).filter(c => !c.my);
let closestTarget = findClosestByRange(tower, targets);
tower.attack(closestTarget);
```

### `findInRange(fromPos, positions, range)`

game/utils

Find all objects in the specified linear range.

| parameter | type | description |
| --- | --- | --- |
| fromPos | object | The origin position. May be [GameObject](#gameobject) or any object containing x and y properties. |
| positions | array | The positions to search. An array with [GameObject](#gameobject)s or any objects containing x and y properties. |
| range | number | The range distance. |

Returns an array with the objects found.

```javascript
let targets = getObjectsByPrototype(Creep).filter(c => !c.my);
let targetsInRange = findInRange(creep, targets, 3);
if (targetsInRange.length >= 3) {
    creep.rangedMassAttack();
} else if (targetsInRange.length > 0) {
    creep.rangedAttack(targetsInRange[0]);
}
```

### `findPath(fromPos, toPos, [opts])`

game/utils

Find an optimal path between fromPos and toPos. Unlike [searchPath](#searchpathorigin-goal-opts), findPath avoid all obstacles by default (unless costMatrix is specified).

| parameter | type | description |
| --- | --- | --- |
| fromPos | object | The start position. May be [GameObject](#gameobject) or any object containing x and y properties. |
| toPos | object | The target position. May be [GameObject](#gameobject) or any object containing x and y properties. |
| opts (optional) | object | An object containing additional pathfinding flags: - ignore array (objects which should not be treated as obstacles during the search) - Any options supported by [searchPath](#searchpathorigin-goal-opts) method |

Returns the path found as an array of objects containing x and y properties

### `getCpuTime()`

game/utils

Get CPU wall time elapsed in the current tick in nanoseconds.

```javascript
import { getCpuTime } from 'game/utils';
import { arenaInfo } from 'game';
export function loop() {
    if( arenaInfo.cpuTimeLimit - getCpuTime() < 1000000) {
        // Less than 1 ms left before timeout!
    }
}
```

### `getDirection(dx, dy)`

game/utils

Get linear direction by differences of x and y.

| parameter | type | description |
| --- | --- | --- |
| dx | number | The difference of X coordinate. |
| dy | number | The difference of Y coordinate. |

Returns a number representing one of the direction constants.

```javascript
let pos = path.findIndex(p => p.x == creep.x && p.y == creep.y);
let direction = getDirection(path[pos+1].x-path[pos].x, path[pos+1].y-path[pos].y);
creep.move(direction);
```

### `getHeapStatistics()`

game/utils

Use this method to get heap statistics for your virtual machine. The return value is almost identical to the Node.js function v8.getHeapStatistics. This function returns one additional property: externally\_allocated\_size which is the total amount of currently allocated memory which is not included in the v8 heap but counts against this isolate's memory limit. ArrayBuffer instances over a certain size are externally allocated and will be counted here.

```javascript
import { getHeapStatistics } from 'game/utils';

export function loop() {
    let heap = getHeapStatistics();
    console.log(`Used ${heap.total_heap_size} / ${heap.heap_size_limit}`);
}
```

### `getObjectById(id)`

game/utils

Get an object with the specified unique ID.

| parameter | type | description |
| --- | --- | --- |
| id | string | The id property of the needed object. See [GameObject](#gameobject) prototype. |

```javascript
import { getObjectById } from 'game/utils';
export function loop() {
    runCreep(myCreep.id);
}
function runCreep(id) {
    let creep = getObjectById(id);
    creep.move(RIGHT);
}
```

### `getObjects()`

game/utils

Get all game objects in the game.

Returns an array of [GameObject](#gameobject).

### `getObjectsByPrototype(prototype)`

game/utils

Get all objects in the game with the specified prototype, for example, all creeps.

| parameter | type | description |
| --- | --- | --- |
| prototype | class | A prototype that extends [GameObject](#gameobject). |

Returns an array of [GameObject](#gameobject) of the given prototype.

```javascript
import { getObjectsByPrototype } from 'game/utils';
import { Creep } from 'game/prototypes';

export function loop() {
    const creeps = getObjectsByPrototype(Creep);

    creeps.forEach(function(myCreep) {
        runCreep(myCreep);
    });
}

function runCreep(creep) {
    if(creep.my) {
        creep.move(RIGHT);
    }
}
```

### `getRange(a, b)`

game/utils

Get linear range between two objects. **a** and **b** may be any object containing x and y properties.

| parameter | type | description |
| --- | --- | --- |
| a | object | The first of two objects. May be [GameObject](#gameobject) or any object containing x and y properties. |
| b | object | The second of two objects. May be [GameObject](#gameobject) or any object containing x and y properties. |

Returns a number of squares between two objects.

```javascript
let range = getRange(creep, target);
if(range <= 3) {
    creep.rangedAttack(target);
}
```

### `getTerrainAt(pos)`

game/utils

Get an integer representation of the terrain at the given position.

| parameter | type | description |
| --- | --- | --- |
| pos | object | The position as an object containing x and y properties. |

Returns [TERRAIN\_WALL](#terrain_wall),[TERRAIN\_SWAMP](#terrain_swamp), or[TERRAIN\_PLAIN](#terrain_plain).

```javascript
let matrix = new CostMatrix;
// Fill CostMatrix with full-speed terrain costs for future analysis:
for(let y = 0; y < 100; y++) {
    for(let x = 0; x < 100; x++) {
        let tile = getTerrainAt({x: x, y: y});
        let weight =
            tile === TERRAIN_WALL  ? 255 : // wall  => unwalkable
            tile === TERRAIN_SWAMP ?   5 : // swamp => weight:  5
                                            1 ; // plain => weight:  1
        matrix.set(x, y, weight);
    }
}
```

### `getTicks()`

game/utils

The number of ticks passed from the start of the current game.

```javascript
import { getTicks } from 'game';
export function loop() {
    console.log(getTicks());
}
```

### `searchPath(origin, goal, [opts])`

game/path-finder

Find an optimal path between origin and goal. Note that searchPath without costMatrix specified (see below) uses terrain data only.

| parameter | type | description |
| --- | --- | --- |
| origin | object | See below |
| goal | object | See below |
| opts (optional) | object | See below |

A goal is either an object containing x and y properties or an object as defined below.

If more than one goal is supplied (as an array of goals) then the cheapest path found out of all the goals will be returned.

| property | type | description |
| --- | --- | --- |
| pos | object | an object containing x and y properties |
| range | number | range to pos before the goal is considered reached. The default is 0 |

  

opts is an object containing additional pathfinding flags:

| property | type | description |
| --- | --- | --- |
| costMatrix | CostMatrix | Custom navigation cost data |
| plainCost | number | Cost for walking on plain positions. The default is 2 |
| swampCost | number | Cost for walking on swamp positions. The default is 10 |
| flee | boolean | Instead of searching for a path to the goals this will search for a path away from the goals. The cheapest path that is out of range of every goal will be returned. The default is false |
| maxOps | number | The maximum allowed pathfinding operations. The default value is 50000 |
| maxCost | number | The maximum allowed cost of the path returned. The default is Infinity |
| heuristicWeight | number | Weight from 1 to 9 to apply to the heuristic in the A\* formula F = G + weight \* H. The default value is 1.2 |

Returns an object containing the following properties:

| path | array | The path found as an array of objects containing x and y properties |
| --- | --- | --- |
| ops | number | Total number of operations performed before this path was calculated |
| cost | number | The total cost of the path as derived from plainCost, swampCost, and given CostMatrix instance |
| incomplete | boolean | If the pathfinder fails to find a complete path, this will be true |

```javascript
import { searchPath } from 'game/path-finder';
import { getObjectsByPrototype } from 'game/utils';

export function loop() {
    let target = getObjectsByPrototype(StructureSpawn).find(i => !i.my);
    let creep = getObjectsByPrototype(Creep).find(i => i.my);

    let ret = searchPath(creep, target);
    console.log(ret.cost); // total cost
    console.log(ret.path.length); // tiles count
}
```

## Arena-specific objects

### Power Split

#### `BonusFlag`

class extends [Flag](#flag)

.../power\_split/basic

An object that applies an effect of the specified type to all creeps belonging to the player who captured it.

##### `BonusFlag.bonusType`

string

The affected bodypart type (one of the body part types constants)

### Escort Run

#### `EscortCreep`

class extends [Creep](#creep)

.../escort\_run/basic

A creep that is present on the map from the start and must be escorted to the goal.

## Constants

### `ATTACK`

attack

game/constants

### `ATTACK_POWER`

30

game/constants

### `BODYPART_COST`

game/constants

#### `BODYPART_COST[WORK]`

100

#### `BODYPART_COST[MOVE]`

50

#### `BODYPART_COST[CARRY]`

50

#### `BODYPART_COST[ATTACK]`

80

#### `BODYPART_COST[RANGED_ATTACK]`

150

#### `BODYPART_COST[HEAL]`

250

#### `BODYPART_COST[TOUGH]`

10

### `BODYPART_HITS`

100

game/constants

### `BOTTOM`

5

game/constants

### `BOTTOM_LEFT`

6

game/constants

### `BOTTOM_RIGHT`

4

game/constants

### `BUILD_POWER`

5

game/constants

### `CARRY`

carry

game/constants

### `CARRY_CAPACITY`

50

game/constants

### `CONSTRUCTION_COST`

game/constants

#### `CONSTRUCTION_COST[StructureTower]`

1250

#### `CONSTRUCTION_COST[StructureExtension]`

200

#### `CONSTRUCTION_COST[StructureRoad]`

10

#### `CONSTRUCTION_COST[StructureContainer]`

100

#### `CONSTRUCTION_COST[StructureWall]`

100

#### `CONSTRUCTION_COST[StructureRampart]`

200

#### `CONSTRUCTION_COST[StructureSpawn]`

1000

### `CONSTRUCTION_COST_ROAD_SWAMP_RATIO`

5

game/constants

### `CONSTRUCTION_COST_ROAD_WALL_RATIO`

150

game/constants

### `CONTAINER_CAPACITY`

2000

game/constants

### `CONTAINER_HITS`

300

game/constants

### `CREEP_SPAWN_TIME`

3

game/constants

### `DISMANTLE_COST`

0.005

game/constants

### `DISMANTLE_POWER`

50

game/constants

### `EFF_ATTACK_BOOST`

eff\_attack\_boost

game/constants

### `EFF_CONSTRUCTION_BOOST`

eff\_construction\_boost

game/constants

### `EFF_HEAL_BOOST`

eff\_heal\_boost

game/constants

### `EFF_MOVE_BOOST`

eff\_move\_boost

game/constants

### `EFF_RANGED_ATTACK_BOOST`

eff\_ranged\_attack\_boost

game/constants

### `EFF_WORK_BOOST`

eff\_work\_boost

game/constants

### `ERR_BUSY`

\-4

game/constants

### `ERR_FULL`

\-8

game/constants

### `ERR_INVALID_ARGS`

\-10

game/constants

### `ERR_INVALID_TARGET`

\-7

game/constants

### `ERR_NAME_EXISTS`

\-3

game/constants

### `ERR_NOT_ENOUGH_ENERGY`

\-6

game/constants

### `ERR_NOT_ENOUGH_EXTENSIONS`

\-6

game/constants

### `ERR_NOT_ENOUGH_RESOURCES`

\-6

game/constants

### `ERR_NOT_FOUND`

\-5

game/constants

### `ERR_NOT_IN_RANGE`

\-9

game/constants

### `ERR_NOT_OWNER`

\-1

game/constants

### `ERR_NO_BODYPART`

\-12

game/constants

### `ERR_NO_PATH`

\-2

game/constants

### `ERR_TIRED`

\-11

game/constants

### `EXTENSION_ENERGY_CAPACITY`

100

game/constants

### `EXTENSION_HITS`

100

game/constants

### `HARVEST_POWER`

2

game/constants

### `HEAL`

heal

game/constants

### `HEAL_POWER`

12

game/constants

### `LEFT`

7

game/constants

### `MAX_CONSTRUCTION_SITES`

10

game/constants

### `MAX_CREEP_SIZE`

50

game/constants

### `MOVE`

move

game/constants

### `OBSTACLE_OBJECT_TYPES`

game/constants

\['creep','tower','constructedWall','spawn','extension','link'\]

### `OK`

0

game/constants

### `RAMPART_HITS`

10000

game/constants

### `RAMPART_HITS_MAX`

10000

game/constants

### `RANGED_ATTACK`

ranged\_attack

game/constants

### `RANGED_ATTACK_DISTANCE_RATE`

{0: 1, 1: 1, 2: 0.4, 3: 0.1}

game/constants

### `RANGED_ATTACK_POWER`

10

game/constants

### `RANGED_HEAL_POWER`

4

game/constants

### `REPAIR_COST`

0.01

game/constants

### `REPAIR_POWER`

100

game/constants

### `RESOURCES_ALL`

\[RESOURCE\_ENERGY\]

game/constants

### `RESOURCE_DECAY`

1000

game/constants

### `RESOURCE_ENERGY`

energy

game/constants

### `RIGHT`

3

game/constants

### `ROAD_HITS`

500

game/constants

### `ROAD_WEAROUT`

1

game/constants

### `SOURCE_ENERGY_REGEN`

10

game/constants

### `SPAWN_ENERGY_CAPACITY`

1000

game/constants

### `SPAWN_HITS`

3000

game/constants

### `SPAWN_RANGE`

20

game/constants

### `TERRAIN_PLAIN`

0

game/constants

### `TERRAIN_SWAMP`

2

game/constants

### `TERRAIN_WALL`

1

game/constants

### `TOP`

1

game/constants

### `TOP_LEFT`

8

game/constants

### `TOP_RIGHT`

2

game/constants

### `TOUGH`

tough

game/constants

### `TOWER_CAPACITY`

10

game/constants

### `TOWER_COOLDOWN`

10

game/constants

### `TOWER_ENERGY_COST`

10

game/constants

### `TOWER_FALLOFF`

1

game/constants

### `TOWER_FALLOFF_RANGE`

21

game/constants

### `TOWER_HITS`

3000

game/constants

### `TOWER_OPTIMAL_RANGE`

1

game/constants

### `TOWER_POWER_ATTACK`

1000

game/constants

### `TOWER_POWER_HEAL`

600

game/constants

### `TOWER_POWER_REPAIR`

200

game/constants

### `TOWER_RANGE`

20

game/constants

### `WALL_HITS`

10000

game/constants

### `WALL_HITS_MAX`

10000

game/constants

### `WORK`

work

game/constants
