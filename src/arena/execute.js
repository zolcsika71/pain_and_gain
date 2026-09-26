export function moveCreepsToFlag(myCreeps, flag) {
    for (const creep of myCreeps) {
        creep.moveTo(flag);
    }
}
