// Qualification harness only. Each phase owns exactly one foreground child.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

export function installMeter({ioBytes,heapBytes,rssBytes,deadlineMs,writeRoots,readRoots}) {
    const original={read:fs.readSync,write:fs.writeSync,readFile:fs.readFileSync,writeFile:fs.writeFileSync,open:fs.openSync};
    const start=Date.now(),parse=JSON.parse;let reads=0,writes=0,maxRead=0,maxWrite=0,maxParse=0,heap=0,rss=0;
    const within=(file,roots)=>typeof file==='string'&&roots.some(root=>file===root||file.startsWith(root+'/'));
    function check(n=0){const m=process.memoryUsage();heap=Math.max(heap,m.heapUsed);rss=Math.max(rss,m.rss);if(reads+writes+n>ioBytes||m.heapUsed>heapBytes||m.rss>rssBytes||Date.now()-start>deadlineMs)throw Object.assign(Error('Qualification phase resource limit'),{code:'RESOURCE_LIMIT'});}
    fs.openSync=(file,flags,...args)=>{const writing=typeof flags==='string'?/[wa+]/.test(flags):Boolean(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT));if(typeof file==='string'&&!within(path.resolve(file),writing?writeRoots:readRoots))throw Error('Harness access outside declared roots: '+file);return original.open(file,flags,...args);};
    fs.readSync=(...args)=>{check(args[3]);const n=original.read(...args);reads+=n;maxRead=Math.max(maxRead,args[3]);return n;};
    fs.writeSync=(...args)=>{const n=typeof args[1]==='string'?Buffer.byteLength(args[1]):args[3]??args[1].byteLength;check(n);const got=original.write(...args);writes+=got;maxWrite=Math.max(maxWrite,n);return got;};
    fs.readFileSync=(file,...args)=>{const n=typeof file==='number'?fs.fstatSync(file).size:fs.statSync(file).size;check(n);const before=reads,value=original.readFile(file,...args);if(reads===before)reads+=n;maxRead=Math.max(maxRead,n);return value;};
    fs.writeFileSync=(file,value,...args)=>{const n=Buffer.byteLength(value);check(n);const before=writes,result=original.writeFile(file,value,...args);if(writes===before)writes+=n;maxWrite=Math.max(maxWrite,n);return result;};
    JSON.parse=(value,...args)=>{const n=Buffer.byteLength(String(value));if(n>1048576)throw Object.assign(Error('Qualification parse limit'),{code:'RESOURCE_LIMIT'});maxParse=Math.max(maxParse,n);check();return parse(value,...args);};
    syncBuiltinESMExports();return()=>({readBytes:reads,writeBytes:writes,maxRead,maxWrite,maxParse,heap,rss,elapsedMs:Date.now()-start,nativeSqliteIo:'unmeasured',moduleLoaderIo:'not fully intercepted'});
}

export async function watched({node,args,cwd,env,stdout,stderr,timeoutMs,maxRetainedBytes,maxRssBytes,roots,maxFiles=20000,pollMs=500}) {
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||timeoutMs>1860000)throw Error('Invalid watchdog deadline');
    for(const file of [stdout,stderr])if(fs.existsSync(file))throw Error('Retained output already exists');
    const out=fs.openSync(stdout,'wx'),err=fs.openSync(stderr,'wx'),start=Date.now();let reason=null,peakBytes=0,peakRss=0,monitorError=null;
    const child=spawn(node,args,{cwd,env,detached:true,stdio:['ignore',out,err]});let exited=false;
    function stop(why){if(exited||reason)return;reason=why;try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')monitorError=e.message;}}
    function inspect(){try{let bytes=0,count=0;const walk=dir=>{if(!fs.existsSync(dir))return;const st=fs.lstatSync(dir);if(st.isSymbolicLink())throw Error('Aliased monitored root');if(st.isDirectory()){const entries=fs.opendirSync(dir);try{let e;while((e=entries.readSync())){if(++count>maxFiles)throw Error('Monitor file-count limit');walk(path.join(dir,e.name));}}finally{entries.closeSync();}}else if(st.isFile())bytes+=st.size;else throw Error('Unsupported monitored file');};for(const root of roots)walk(root);peakBytes=Math.max(peakBytes,bytes);if(bytes>maxRetainedBytes)stop('RETAINED_OUTPUT_LIMIT');
        try{const sample=execFileSync('/bin/ps',['-o','rss=','-p',String(child.pid)],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();const rss=Number(sample)*1024;if(Number.isFinite(rss)){peakRss=Math.max(peakRss,rss);if(rss>maxRssBytes)stop('RSS_LIMIT');}}catch(e){if(!exited&&e.status!==1)throw e;}
    }catch(e){monitorError=e.message;stop('MONITOR_FAILURE');}}
    const interval=setInterval(inspect,pollMs),timer=setTimeout(()=>stop('OUTER_TIMEOUT'),timeoutMs);let spawnError;
    const result=await new Promise(resolve=>{child.once('error',e=>{spawnError=e.message;});child.once('close',(code,signal)=>{exited=true;resolve({code,signal});});});
    clearInterval(interval);clearTimeout(timer);fs.closeSync(out);fs.closeSync(err);
    if(!reason&&result.code!==0)reason='CHILD_FAILURE';return{command:[node,...args],pid:child.pid,...result,reason,spawnError,monitorError,confirmedExit:true,elapsedMs:Date.now()-start,peakRetainedBytes:peakBytes,peakRss,limits:{timeoutMs,maxRetainedBytes,maxRssBytes,maxFiles,pollMs}};
}
