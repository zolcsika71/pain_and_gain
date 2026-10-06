import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
// Deadlines include spawn-to-exit; a killed or late worker can never pass.
export function child(args,deadline) {
    return new Promise((resolve,reject)=>{
        const started=performance.now(),p=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='',size=0,failure,killTimer,reapTimer;
        const stop=reason=>{if(failure)return;failure=Error(reason);p.kill('SIGTERM');killTimer=setTimeout(()=>{p.kill('SIGKILL');reapTimer=setTimeout(()=>{p.stdout.destroy();p.stderr.destroy();p.unref();reject(Object.assign(Error(reason+'; shutdown failed'),{stdout,stderr,elapsedMs:performance.now()-started}));},3000);},2000);};
        const timer=setTimeout(()=>stop(`Worker exceeded ${deadline}ms`),deadline);
        for(const [stream,name]of [[p.stdout,'stdout'],[p.stderr,'stderr']])stream.on('data',b=>{size+=b.length;if(size>1048576){stop('Worker output exceeded 1 MiB');return;}if(name==='stdout')stdout+=b;else stderr+=b;});
        p.on('error',e=>{clearTimeout(timer);reject(e);});
        p.on('close',(code,signal)=>{clearTimeout(timer);clearTimeout(killTimer);clearTimeout(reapTimer);const elapsedMs=performance.now()-started;
            if(failure)return reject(Object.assign(failure,{code,signal,stdout,stderr,elapsedMs}));
            try{assert.equal(code,0,stderr||stdout);assert.ok(elapsedMs<=deadline);resolve({args,code,signal,elapsedMs,stderr,result:JSON.parse(stdout.trim().split('\n').at(-1))});}catch(e){reject(Object.assign(e,{stdout,stderr,elapsedMs}));}
        });
    });
}
