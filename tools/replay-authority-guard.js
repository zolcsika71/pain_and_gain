// Synthetic authority leases. No production selector or implicit backend fallback.
import fs from 'node:fs';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {resident,withCleanup} from './retrieval-files.js';
import {fail} from './replay-store-payloads.js';
import {assertLegacyAuthority} from './replay-production-scope.js';

export const AUTHORITY_FILE='.synthetic-authority.json',MEMBER_FILE='.synthetic-authority-member.json';
const leases=new AsyncLocalStorage();
export const authorityHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function authorityControl(file){
    const st=resident(file);
    if(fs.realpathSync(file)!==file||st.nlink!==1||st.size>16384)fail('UNSAFE_AUTHORITY','Invalid authority control');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let primary;
    try{const opened=fs.fstatSync(fd);if(opened.ino!==st.ino||opened.dev!==st.dev||opened.size!==st.size)fail('CHANGED_INPUT','Authority control changed');
        const bytes=fs.readFileSync(fd);const end=fs.fstatSync(fd),named=fs.lstatSync(file);
        if(bytes.length!==st.size||end.mtimeMs!==st.mtimeMs||end.ctimeMs!==st.ctimeMs||named.ino!==st.ino)fail('CHANGED_INPUT','Authority control changed');
        return{value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),hash:authorityHash(bytes)};
    }catch(e){primary=e;throw e;}finally{try{fs.closeSync(fd);}catch(e){if(primary instanceof Error)withCleanup(primary,e);else if(primary!==undefined)throw new AggregateError([primary,e],'Control operation/cleanup',{cause:primary});else throw e;}}
}
function present(file){try{fs.lstatSync(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export function assertAuthorityAccess(root,backend){
    if(backend==='v2')assertLegacyAuthority(root);
    const control=path.join(root,backend==='sqlite'?AUTHORITY_FILE:MEMBER_FILE);
    const exists=present(control);
    if(!exists&&!present(path.join(root,MEMBER_FILE)))return; // Unbound behavior is unchanged.
    const lease=leases.getStore();
    if(!lease?.active||lease.backend!==backend||lease.target!==root)fail('AUTHORITY_REQUIRED','Use the bound synthetic authority, not a backend root');
    if(backend==='v2'){
        const member=authorityControl(control).value;
        if(member.anchor!==lease.anchor||member.storeId!==lease.storeId||member.productionAuthority!==false)fail('AUTHORITY_CONFLICT','Rollback member binding changed');
    }
    if(backend==='sqlite'&&!exists&&lease.hash===null)return; // Locked initialization recovery only.
    if(authorityControl(path.join(lease.anchor,AUTHORITY_FILE)).hash!==lease.hash)fail('AUTHORITY_CONFLICT','Authority changed during access');
}
export async function authorityLease(anchor,state,hash,callback){
    if(leases.getStore()?.active)fail('AUTHORITY_CONFLICT','Nested authority operations are unsupported');
    const lease={anchor,backend:state.backend,target:state.target,storeId:state.storeId,hash,active:true};
    try{return await leases.run(lease,callback);}finally{lease.active=false;}
}

// Optional bounded access checks exist only during a selected restored-v2
// command. Unbound ordinary v2 commands retain their existing behavior.
export function authorityV2Boundary(root,operation,value){
    assertLegacyAuthority(root);
    const member=path.join(root,MEMBER_FILE);
    if(!present(member))return undefined;
    assertAuthorityAccess(root,'v2');
    const lease=leases.getStore();
    if(!lease.v2Checks)fail('AUTHORITY_REQUIRED','Use the bounded restored-v2 dispatcher');
    return lease.v2Checks(operation,value);
}
export async function withAuthorityV2Checks(checks,callback){
    const lease=leases.getStore();
    if(!lease?.active||lease.backend!=='v2'||lease.v2Checks)fail('AUTHORITY_REQUIRED','Selected restored-v2 lease required');
    lease.v2Checks=checks;
    try{return await callback();}finally{delete lease.v2Checks;}
}
