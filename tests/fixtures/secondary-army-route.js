// Existing conservative stress-model BFS, NOT Arena findPath or a resolver.
// A missing complete route does not establish that moveTo produces no movement.
export function secondaryModelRoute(terrain,from,to,occupied=new Set()){
    const key=p=>p.y*100+p.x,goal=key(to),start=key(from),queue=[start],parents=new Map([[start,null]]);let found=null,ops=0;
    for(let i=0;i<queue.length&&ops<5000;i++){
        const n=queue[i];ops++;if(n===goal){found=n;break;}
        const x=n%100,y=Math.floor(n/100);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const p={x:x+dx,y:y+dy},k=key(p);
            if(p.x<0||p.y<0||p.x>=100||p.y>=100||terrain[p.y][p.x]!==0||parents.has(k)||k!==goal&&occupied.has(k))continue;
            parents.set(k,n);queue.push(k);
        }
    }
    if(found===null)return{steps:null,next:null,ops,status:ops<queue.length?'model-search-budget':'model-no-complete-route'};
    let steps=0,next=null;for(let n=found;parents.get(n)!==null;n=parents.get(n)){steps++;next={x:n%100,y:Math.floor(n/100)};}
    return{steps,next,ops,status:'model-complete-route'};
}
