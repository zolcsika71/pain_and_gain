import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
// Retain every phase's complete bounded output, including failed/interrupted
// runs. Completion includes exit AND closure of inherited stdout/stderr pipes.
export function phase(args,deadline,receipts,name){return new Promise((resolve,reject)=>{
 const at=performance.now(),p=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']}),parts={stdout:[],stderr:[]},sizes={stdout:0,stderr:0};let failure,kill,reap,settled=false,parentPeakRssBytes=0;
 const finish=(code,signal,unreaped=false)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(kill);clearTimeout(reap);clearInterval(monitor);const elapsedMs=performance.now()-at;for(const key of Object.keys(parts))fs.writeFileSync(path.join(receipts,`${name}.${key}.log`),Buffer.concat(parts[key]));let result;try{if(!failure&&code!==0)throw Error(`Worker exit ${code}`);if(!failure&&elapsedMs>deadline)throw Error('Phase deadline exceeded');if(!failure){const raw=Buffer.concat(parts.stdout);if(raw.length>512*1024)throw Error('Receipt exceeds 512 KiB');result=JSON.parse(raw);if(result.maxRssBytes>256*1048576)throw Error('RSS ceiling exceeded');}}catch(e){failure=e;}
 const receipt={args,deadline,code,signal,elapsedMs,parentPeakRssBytes,unreaped,failure:failure?.message??null};fs.writeFileSync(path.join(receipts,`${name}.process.json`),JSON.stringify(receipt));if(failure)reject(Object.assign(failure,{receipt,receipts}));else{fs.writeFileSync(path.join(receipts,`${name}.json`),JSON.stringify(result));resolve({...receipt,result});}};
 const stop=reason=>{if(failure)return;failure=Error(reason);p.kill('SIGTERM');kill=setTimeout(()=>{p.kill('SIGKILL');reap=setTimeout(()=>{p.stdout.destroy();p.stderr.destroy();p.unref();finish(null,'SIGKILL',true);},3000);},2000);};
 const timer=setTimeout(()=>stop('Phase deadline exceeded'),deadline);
 const monitor=setInterval(()=>{try{const rss=Number(execFileSync('ps',['-o','rss=','-p',String(p.pid)],{encoding:'utf8',timeout:1000}))*1024;parentPeakRssBytes=Math.max(parentPeakRssBytes,rss);if(rss>256*1048576)stop('Parent observed RSS ceiling exceeded');}catch{/* Process may have exited before pipe closure. */}},25);
 for(const key of Object.keys(parts))p[key].on('data',b=>{sizes[key]+=b.length;if(sizes[key]>1048576){stop(`${key} exceeded 1 MiB`);return;}parts[key].push(b);});
 p.on('error',e=>{failure=e;finish(null,null);});p.on('close',(code,signal)=>finish(code,signal));
});}
