# How to do squads and pairing.

Pairing is simple - you just want to have two creeps that have each other’s name or id in memory and wait for each other before doing movement. It gets more complicated but here’s the basic idea. 

The follower Creep looks for leader and is nearTo just moves to his spot always.

```javascript
let leaderCreep = Game.getObjectById(creep.memory.leaderID);
    if (leaderCreep ) {
        if (leaderCreep && creep.pos.isNearTo(leaderCreep) ) {
            creep.move(creep.pos.getDirectionTo(leaderCreep));
        } else if (leaderCreep && !creep.pos.isNearTo(leaderCreep)) {
            creep.moveTo(leaderCreep, { reusePath: 15 });
        }
        return;
    }
```

The leaderCreep looks for follower and if it’s not next to follower it waits.  

```javascript
let followerCreep = Game.getObjectById(creep.memory.followerCreeplowerID);
    if (followerCreep ) {
        if(!creep.pos.isNearTo(followerCreep)){
        return;
        }
    }
```

## How to do quad formations:

First steps is grouping creeps together, and once they are together you want to organize the code that you’re coding them together. Then separate controller/actions/movement as so:

```javascript
squad = []; // squad is an array of creep objects.
controller (squad);
actions(squad);
movement(squad);
```

Keep each action separate, controller decides what the squad will do, and action() is healing/attack/rangedHealing logic, movement() implements based off of controller. Each is difficult as is, separating them will help separate logic easier. 

The next idea is that you separate creep from squadPosistion by creating a roomPosistion that the squad will use to position it self around. A creep by it self has it’s position matching the squad position.

With 0 being the squadPos, a creep will get a direction that will be positioned around the center. :

```text
812
703
654
```

0 - is the center groupPoint and creep.memory.basePosition .

Each number relates to an direction, and a position around 0/center that a creep will take. We will keep this simple and do a 2x2 squad first, so the positions we are looking at are 

```text
12
03
```

0 - being the groupPoint.

A squad.length >= 4 creeps will fill in these spots.

so the very first step is getting 4 creeps, having a groupPoint and having all creeps assigned a posistion/direction around 0 - for above 1/2/3 and the offset from center - 1 = -1x, 2 = -1x +1y

Once that is done, you want to create a costMatrix for terrain, going through the room.terrain, each time you see a wall/swamp you mark the opposite side of the groupPoint

so, if your occupying points 0-4 when you see a swamp, you mark 0,5,6,7 as 5 for swamp.  
When you see a wall you mark 0,5,6,7 as 255 so that groupPoint can never touch the wall in that way

![Squad positions and terrain marking diagram][image1]

Here are some visual help, the 0,1,2,3 is where creeps are as there posistion. The green X is where the terran you are marking. You are marking it’s 0,5,6,7 which is the opposite side of 0,1,2,3.

![Squad movement restrictions diagram][image2]  
With a clearer picture I’ve added x to where the squad cannot move to. 

```javascript
let pathResult = PathFinder.search(groupPoint, target , {
                       roomCallback: roomName => matrixComm.getMatrix()
                   });
squadMoveDir = groupPoint.getDirectionTo(pathResult.path[0])
```

PathFinder returns a complete path to that target, you can use the first result in it to get the direction your squad should move

pass squadMoveDir is a number 1-8 that each squad[i].move(squadMoveDir)

### Back to squad formations, we will discuss how to create a Front and back squad positions.

```text
812
703
654
```

We are using 

```text
12
03
```

It’s easiest to pick a number a make that determine to be the ‘front.’ We are going to be picking basePosition 1 as the ‘front’ . If each creep has a memory.basePosition, and we will create a var called ‘facingDir’ and set that as 0;

By adding basePostion and facingDir we now get a currentPosition for each creep. But we need to add in some checks.

For a squad size of 4 `if (currentPosition  > 4) currentPosition -=4;`

[image1]: images/squad-positions-and-terrain-marking.png

[image2]: images/squad-movement-restrictions.png
