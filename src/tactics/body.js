export function hasFunctioningPart(creep, type) {
    return creep.body.some(part => part.type === type && part.hits > 0);
}
