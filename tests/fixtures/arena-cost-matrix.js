// Arena-shaped storage double only. No search or movement arbitration.
import assert from 'node:assert/strict';
export class TestCostMatrix{
    constructor(){this.data=new Uint8Array(10000);}
    get(x,y){return this.data[y*100+x];}
    set(x,y,cost){
        assert(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<100&&y<100);
        assert(Number.isInteger(cost)&&cost>=0&&cost<=255);this.data[y*100+x]=cost;
    }
    clone(){const copy=new TestCostMatrix();copy.data.set(this.data);return copy;}
}
