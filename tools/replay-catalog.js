// ADR 0006 C1: synthetic metadata only. No command imports this module.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCatalogFoundation, openCatalogFoundation, recordKey } from './replay-store.js';
import { LIMITS, fail, inlineJson } from './replay-store-payloads.js';

export const createCatalogFixture = options => createCatalogFoundation(options);
export const openCatalog = options => openCatalogFoundation(options);
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/, REPLAY=/^[a-f0-9]{24}$/;
const MAX=9_223_372_036_854_775_807n;
const verdicts=['unknown','unexercised','passed','failed'];
const knowledge=['observed','reported','local-verified','unknown','conflicting','invalid'];
const coverageStates=['covered','gap','unknown','conflicting','invalid'];
const jsonCheck='CHECK(length(CAST(value AS BLOB))<=65536)';
const ordinal='ordinal INTEGER NOT NULL CHECK(ordinal>=0)';
const tables={
    replay:['catalog_replays','replay_id'], capture:['catalog_captures','capture_key'],
    upload:['catalog_uploads','upload_key'], build:['catalog_builds','build_id'], config:['catalog_configs','config_id'],
    artifact:['catalog_artifacts','artifact_id'], question:['catalog_questions','question_id'], run:['catalog_runs','run_id'],
    finding:['catalog_findings','finding_id'], conclusion:['catalog_conclusions','conclusion_id'],
    experiment:['catalog_experiments','experiment_id'], task:['catalog_tasks','task_id'],
    'conclusion-revision':['catalog_conclusion_revisions','subject_id'], 'experiment-revision':['catalog_experiment_revisions','subject_id']
};
function columnsWithValue(columns){const i=columns.search(/\b(?:UNIQUE\(|FOREIGN KEY\()/);const fields=i<0?columns:columns.slice(0,i),constraints=i<0?'':columns.slice(i).replace(/,\s*$/,'');return `${fields}${ordinal}, value TEXT NOT NULL ${jsonCheck}${constraints?', '+constraints:''}`;}
const typed=(name,key,columns='')=>`CREATE TABLE ${name} (${key} TEXT PRIMARY KEY, subject_id TEXT NOT NULL UNIQUE REFERENCES catalog_subjects(subject_id), ${columnsWithValue(columns)}) STRICT;`;
const event=(name,key,columns)=>`CREATE TABLE ${name} (${key}, ${columnsWithValue(columns)}) STRICT;`;
const schema=`
CREATE TABLE catalog_subjects (subject_id TEXT PRIMARY KEY, kind TEXT NOT NULL, natural_key TEXT, ${ordinal}, UNIQUE(kind,natural_key)) STRICT;
CREATE INDEX catalog_subject_page ON catalog_subjects(kind,ordinal,subject_id);
${typed('catalog_replays','replay_id')}
${typed('catalog_captures','capture_key',"collection TEXT NOT NULL CHECK(collection IN ('log','score')), replay_id TEXT NOT NULL REFERENCES catalog_replays(replay_id), fingerprint TEXT NOT NULL, UNIQUE(collection,replay_id,fingerprint),")}
CREATE INDEX catalog_capture_page ON catalog_captures(replay_id,ordinal,capture_key);
CREATE INDEX catalog_capture_all ON catalog_captures(ordinal,capture_key);
${typed('catalog_uploads','upload_key','player_key TEXT NOT NULL, code_id TEXT NOT NULL, UNIQUE(player_key,code_id),')}
${typed('catalog_builds','build_id')}
${typed('catalog_configs','config_id')}
${typed('catalog_artifacts','artifact_id','owner_kind TEXT NOT NULL, owner_key TEXT NOT NULL, field TEXT NOT NULL, format TEXT NOT NULL, hash TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0), path TEXT NOT NULL, UNIQUE(owner_kind,owner_key,field,format),')}
${typed('catalog_questions','question_id','predecessor TEXT REFERENCES catalog_questions(question_id),')}
${typed('catalog_runs','run_id',"question_id TEXT NOT NULL REFERENCES catalog_questions(question_id), workflow TEXT NOT NULL CHECK(workflow IN ('planned','running','completed','errored','cancelled')), sealed INTEGER NOT NULL CHECK(sealed IN (0,1)), selection_digest TEXT, selection_version TEXT, source_count INTEGER CHECK(source_count BETWEEN 0 AND 64), result_digest TEXT,")}
CREATE INDEX catalog_run_question ON catalog_runs(question_id,ordinal,run_id);
${typed('catalog_findings','finding_id',"run_id TEXT NOT NULL REFERENCES catalog_runs(run_id), verdict TEXT CHECK(verdict IN ('unknown','unexercised','passed','failed')), UNIQUE(run_id,ordinal),")}
CREATE INDEX catalog_finding_page ON catalog_findings(run_id,ordinal,finding_id);
CREATE INDEX catalog_finding_verdict ON catalog_findings(run_id,verdict,ordinal,finding_id);
${typed('catalog_conclusions','conclusion_id',"question_id TEXT NOT NULL REFERENCES catalog_questions(question_id), current_revision INTEGER NOT NULL CHECK(current_revision>=0), workflow TEXT NOT NULL CHECK(workflow IN ('open','active','deferred','closed')),")}
${typed('catalog_experiments','experiment_id',"current_revision INTEGER NOT NULL CHECK(current_revision>=0), workflow TEXT NOT NULL CHECK(workflow IN ('open','active','deferred','closed')),")}
${typed('catalog_tasks','task_id')}
${event('catalog_provenance','assertion_id TEXT PRIMARY KEY','subject_id TEXT NOT NULL REFERENCES catalog_subjects(subject_id), field TEXT NOT NULL, evidence_ref_id TEXT REFERENCES catalog_evidence_refs(evidence_ref_id), state TEXT NOT NULL,')}
CREATE INDEX catalog_provenance_page ON catalog_provenance(subject_id,ordinal,assertion_id);
${event('catalog_coverage','coverage_id TEXT PRIMARY KEY','capture_key TEXT NOT NULL REFERENCES catalog_captures(capture_key), dimension TEXT NOT NULL, start INTEGER, end INTEGER, evidence_ref_id TEXT REFERENCES catalog_evidence_refs(evidence_ref_id), UNIQUE(capture_key,ordinal),')}
CREATE INDEX catalog_coverage_page ON catalog_coverage(capture_key,dimension,start,ordinal,coverage_id);
${event('catalog_question_links','link_key TEXT PRIMARY KEY','question_id TEXT NOT NULL REFERENCES catalog_questions(question_id), related_question_id TEXT NOT NULL REFERENCES catalog_questions(question_id), role TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES catalog_tasks(task_id), UNIQUE(question_id,related_question_id,role),')}
CREATE INDEX catalog_question_reverse ON catalog_question_links(related_question_id,ordinal,link_key);
${event('catalog_run_sources','source_key TEXT PRIMARY KEY','run_id TEXT NOT NULL REFERENCES catalog_runs(run_id), capture_key TEXT NOT NULL REFERENCES catalog_captures(capture_key), UNIQUE(run_id,ordinal), UNIQUE(run_id,capture_key),')}
CREATE INDEX catalog_source_page ON catalog_run_sources(run_id,ordinal,source_key);
${event('catalog_evidence_refs','evidence_ref_id TEXT PRIMARY KEY','capture_key TEXT NOT NULL REFERENCES catalog_captures(capture_key), artifact_id TEXT REFERENCES catalog_artifacts(artifact_id),')}
CREATE INDEX catalog_evidence_capture ON catalog_evidence_refs(capture_key,ordinal,evidence_ref_id);
${event('catalog_finding_evidence','link_key TEXT PRIMARY KEY','finding_id TEXT NOT NULL REFERENCES catalog_findings(finding_id), evidence_ref_id TEXT NOT NULL REFERENCES catalog_evidence_refs(evidence_ref_id), role TEXT NOT NULL, UNIQUE(finding_id,ordinal),')}
CREATE INDEX catalog_finding_evidence_page ON catalog_finding_evidence(finding_id,ordinal,link_key);
CREATE INDEX catalog_finding_evidence_reverse ON catalog_finding_evidence(evidence_ref_id,ordinal,link_key);
CREATE TABLE catalog_conclusion_revisions (subject_id TEXT PRIMARY KEY REFERENCES catalog_subjects(subject_id), conclusion_id TEXT NOT NULL REFERENCES catalog_conclusions(conclusion_id), revision INTEGER NOT NULL CHECK(revision>=1), predecessor INTEGER, verdict TEXT CHECK(verdict IN ('unknown','unexercised','passed','failed')), task_id TEXT NOT NULL REFERENCES catalog_tasks(task_id), input_digest TEXT NOT NULL, ${ordinal}, value TEXT NOT NULL ${jsonCheck}, UNIQUE(conclusion_id,revision), FOREIGN KEY(conclusion_id,predecessor) REFERENCES catalog_conclusion_revisions(conclusion_id,revision), CHECK((revision=1 AND predecessor IS NULL) OR (revision>1 AND predecessor IS NOT NULL AND predecessor=revision-1))) STRICT;
CREATE INDEX catalog_conclusion_history ON catalog_conclusion_revisions(conclusion_id,ordinal,subject_id);
${event('catalog_conclusion_support','link_key TEXT PRIMARY KEY','conclusion_id TEXT NOT NULL, revision INTEGER NOT NULL, finding_id TEXT NOT NULL REFERENCES catalog_findings(finding_id), role TEXT NOT NULL CHECK(role IN (\'support\',\'counterevidence\')), FOREIGN KEY(conclusion_id,revision) REFERENCES catalog_conclusion_revisions(conclusion_id,revision), UNIQUE(conclusion_id,revision,ordinal),')}
CREATE INDEX catalog_support_page ON catalog_conclusion_support(conclusion_id,revision,ordinal,link_key);
CREATE INDEX catalog_support_finding ON catalog_conclusion_support(finding_id,ordinal,link_key);
CREATE TABLE catalog_experiment_revisions (subject_id TEXT PRIMARY KEY REFERENCES catalog_subjects(subject_id), experiment_id TEXT NOT NULL REFERENCES catalog_experiments(experiment_id), revision INTEGER NOT NULL CHECK(revision>=1), predecessor INTEGER, question_id TEXT NOT NULL REFERENCES catalog_questions(question_id), task_id TEXT NOT NULL REFERENCES catalog_tasks(task_id), ${ordinal}, value TEXT NOT NULL ${jsonCheck}, UNIQUE(experiment_id,revision), FOREIGN KEY(experiment_id,predecessor) REFERENCES catalog_experiment_revisions(experiment_id,revision), CHECK((revision=1 AND predecessor IS NULL) OR (revision>1 AND predecessor IS NOT NULL AND predecessor=revision-1))) STRICT;
CREATE INDEX catalog_experiment_history ON catalog_experiment_revisions(experiment_id,ordinal,subject_id);
${event('catalog_experiment_runs','link_key TEXT PRIMARY KEY','experiment_id TEXT NOT NULL, revision INTEGER NOT NULL, run_id TEXT NOT NULL REFERENCES catalog_runs(run_id), arm TEXT NOT NULL CHECK(arm IN (\'baseline\',\'candidate\',\'observational\',\'unknown\')), FOREIGN KEY(experiment_id,revision) REFERENCES catalog_experiment_revisions(experiment_id,revision), UNIQUE(experiment_id,revision,run_id),')}
CREATE INDEX catalog_experiment_run ON catalog_experiment_runs(run_id,ordinal,link_key);
${event('catalog_reviews','review_key TEXT PRIMARY KEY','target_subject_id TEXT NOT NULL REFERENCES catalog_subjects(subject_id), task_id TEXT NOT NULL REFERENCES catalog_tasks(task_id), checkpoint TEXT NOT NULL CHECK(checkpoint IN (\'claimed\',\'examined\',\'completed\')), UNIQUE(target_subject_id,task_id),')}
CREATE INDEX catalog_review_page ON catalog_reviews(target_subject_id,ordinal,review_key);
${event('catalog_review_events','event_id TEXT PRIMARY KEY','target_subject_id TEXT NOT NULL REFERENCES catalog_subjects(subject_id), task_id TEXT NOT NULL REFERENCES catalog_tasks(task_id), checkpoint TEXT NOT NULL,')}
CREATE INDEX catalog_review_event_page ON catalog_review_events(target_subject_id,task_id,ordinal,event_id);
${event('catalog_workflow_events','event_id TEXT PRIMARY KEY','subject_id TEXT NOT NULL REFERENCES catalog_subjects(subject_id), task_id TEXT NOT NULL REFERENCES catalog_tasks(task_id), previous TEXT, next TEXT NOT NULL, UNIQUE(subject_id,ordinal),')}
CREATE INDEX catalog_workflow_page ON catalog_workflow_events(subject_id,ordinal,event_id);
${event('catalog_artifact_events','event_id TEXT PRIMARY KEY','artifact_id TEXT NOT NULL REFERENCES catalog_artifacts(artifact_id), task_id TEXT NOT NULL REFERENCES catalog_tasks(task_id), UNIQUE(artifact_id,ordinal),')}
CREATE INDEX catalog_artifact_event_page ON catalog_artifact_events(artifact_id,ordinal,event_id);
CREATE TABLE catalog_properties (subject_id TEXT NOT NULL REFERENCES catalog_subjects(subject_id), pointer TEXT NOT NULL, ${ordinal}, value TEXT NOT NULL ${jsonCheck}, PRIMARY KEY(subject_id,pointer)) STRICT;
CREATE INDEX catalog_property_page ON catalog_properties(subject_id,ordinal,pointer);
`;
const immutable=['catalog_subjects','catalog_replays','catalog_captures','catalog_uploads','catalog_builds','catalog_configs','catalog_artifacts','catalog_questions','catalog_tasks','catalog_findings','catalog_provenance','catalog_coverage','catalog_question_links','catalog_run_sources','catalog_evidence_refs','catalog_finding_evidence','catalog_conclusion_revisions','catalog_conclusion_support','catalog_experiment_revisions','catalog_experiment_runs','catalog_review_events','catalog_workflow_events','catalog_artifact_events','catalog_properties'];
const guards=immutable.map(t=>`CREATE TRIGGER ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END; CREATE TRIGGER ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;`).join('\n')+['catalog_runs','catalog_conclusions','catalog_experiments','catalog_reviews'].map(t=>`CREATE TRIGGER ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END; CREATE TRIGGER ${t}_immutable_value BEFORE UPDATE OF value,ordinal ON ${t} BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;`).join('\n')+`
CREATE TRIGGER catalog_support_no_late_insert BEFORE INSERT ON catalog_conclusion_support WHEN (SELECT current_revision FROM catalog_conclusions WHERE conclusion_id=NEW.conclusion_id)>=NEW.revision BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER catalog_evidence_no_late_insert BEFORE INSERT ON catalog_finding_evidence WHEN (SELECT workflow FROM catalog_runs JOIN catalog_findings USING(run_id) WHERE finding_id=NEW.finding_id)!='running' BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER catalog_finding_publication BEFORE INSERT ON catalog_findings WHEN (SELECT workflow FROM catalog_runs WHERE run_id=NEW.run_id)!='running' BEGIN SELECT RAISE(ABORT,'INVALID_STATE'); END;
CREATE TRIGGER catalog_run_identity BEFORE UPDATE OF run_id,subject_id,question_id ON catalog_runs BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER catalog_run_selection_locked BEFORE UPDATE OF sealed,selection_digest,selection_version,source_count ON catalog_runs WHEN OLD.sealed=1 BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER catalog_run_terminal BEFORE UPDATE ON catalog_runs WHEN OLD.workflow IN ('completed','errored','cancelled') BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER catalog_conclusion_identity BEFORE UPDATE OF conclusion_id,subject_id,question_id ON catalog_conclusions BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER catalog_experiment_identity BEFORE UPDATE OF experiment_id,subject_id ON catalog_experiments BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER catalog_conclusion_head BEFORE UPDATE OF current_revision ON catalog_conclusions WHEN NEW.current_revision!=OLD.current_revision+1 OR NOT EXISTS(SELECT 1 FROM catalog_conclusion_revisions WHERE conclusion_id=OLD.conclusion_id AND revision=NEW.current_revision) BEGIN SELECT RAISE(ABORT,'INVALID_STATE'); END;
CREATE TRIGGER catalog_experiment_head BEFORE UPDATE OF current_revision ON catalog_experiments WHEN NEW.current_revision!=OLD.current_revision+1 OR NOT EXISTS(SELECT 1 FROM catalog_experiment_revisions WHERE experiment_id=OLD.experiment_id AND revision=NEW.current_revision) BEGIN SELECT RAISE(ABORT,'INVALID_STATE'); END;
`;

function string(value,name='text'){if(typeof value!=='string'||!value||Buffer.byteLength(value)>LIMITS.inline)fail('INVALID_IDENTITY',`Invalid ${name}`);return value;}
function uuid(value){if(!UUID.test(value??''))fail('INVALID_IDENTITY','Catalog UUID required');return value;}
function number(value){if((typeof value!=='bigint'&&!Number.isSafeInteger(value))||value<0||BigInt(value)>MAX)fail('RESOURCE_LIMIT','Invalid nonnegative integer');return value;}
const has=(v,k)=>Object.hasOwn(v,k);
function object(v){if(!v||typeof v!=='object'||Array.isArray(v))fail('INVALID_JSON','Object required');inlineJson(v);return v;}
function range(v){if(v===undefined||v===null)return;object(v);if(has(v,'start')!==has(v,'end'))fail('INVALID_REFERENCE','Both range bounds required');if(has(v,'start')){number(v.start);number(v.end);if(v.end<v.start)fail('INVALID_REFERENCE','Reversed range');}}
function scopeInterval(scope){
    if(scope===undefined||scope===null)return null;object(scope);range(scope.range);
    let interval=scope.range?.start===undefined?null:{...scope.range,dimension:scope.range.dimension??'runtime-tick'};
    if(has(scope,'ticks')){
        if(!Array.isArray(scope.ticks)||scope.ticks.length!==2)fail('INVALID_REFERENCE','Inclusive tick pair required');
        const ticks={start:scope.ticks[0],end:scope.ticks[1],dimension:'runtime-tick'};range(ticks);
        if(interval&&(interval.start!==ticks.start||interval.end!==ticks.end||interval.dimension!==ticks.dimension))fail('INVALID_REFERENCE','Scope interval aliases disagree');interval=ticks;
    }
    return interval;
}
const overlaps=(a,b)=>a.dimension===b.dimension&&a.start<=b.end&&b.start<=a.end;
const contains=(a,b)=>a.dimension===b.dimension&&a.start<=b.start&&a.end>=b.end;
function covers(intervals,target){
    let next=BigInt(target.start);
    for(const r of intervals.sort((a,b)=>a.start<b.start?-1:a.start>b.start?1:0)){
        if(BigInt(r.start)>next)return false;
        if(BigInt(r.end)>=next)next=BigInt(r.end)+1n;
        if(next>BigInt(target.end))return true;
    }return false;
}
const digest=v=>createHash('sha256').update(inlineJson(v,LIMITS.pageBytes)).digest('hex');
function captureKey(value){if(typeof value!=='string')return recordKey(value);let parsed;try{parsed=JSON.parse(value);}catch{fail('INVALID_IDENTITY','Invalid capture tuple');}if(!Array.isArray(parsed)||parsed.length!==3)fail('INVALID_IDENTITY','Capture tuple required');const [collection,replayId,fingerprint]=parsed;const key=recordKey({collection,replayId,fingerprint});if(key!==value)fail('INVALID_IDENTITY','Canonical capture tuple required');return key;}
const encodedRow=v=>inlineJson(Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typeof x==='bigint'?x.toString():x])));
const decode=r=>r&&({...r,value:JSON.parse(r.value)});
const eq=(a,b)=>inlineJson(a)===inlineJson(b);
function safeReference(p){string(p,'artifact path');if(path.isAbsolute(p)||p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..'))fail('UNSAFE_PATH','Store-relative artifact path required');}

// Internal typed adapter used only by the versioned core. It never exposes db.
function writer({db,stmt,writer:core,store}){
    let context;
    const query=(sql,args=[],type='get')=>stmt(db,sql,args,type);
    const need=(table,key,value)=>{const r=query(`SELECT * FROM ${table} WHERE ${key}=?`,[value]);if(!r)fail('INVALID_REFERENCE',`Missing ${table} reference`);return decode(r);};
    // Subjects have no JSON value.
    const subjectRow=id=>{const r=query('SELECT * FROM catalog_subjects WHERE subject_id=?',[id]);if(!r)fail('INVALID_REFERENCE','Missing subject');return r;};
    const task=id=>need('catalog_tasks','task_id',string(id,'task ID'));
    const countInput=(v,rows=1)=>{context.rows+=rows;context.bytes+=Buffer.byteLength(inlineJson(v));if(context.rows>LIMITS.page||context.bytes>LIMITS.pageBytes)fail('RESOURCE_LIMIT','Complete C1 transaction input budget');};
    const countCall=(name,v)=>{
        if(name==='publishRunResult'){const {findings,evidenceRefs,...metadata}=v;countInput(metadata);}
        else if(name==='appendConclusionRevision'){const {support,...metadata}=v;countInput(metadata);}
        else if(name==='appendRunSources'){const {sources,...metadata}=v;countInput(metadata,0);}
        else countInput(v);
    };
    function put(table,key,id,value,fields={},ord=0){
        const json=inlineJson(value);const old=query(`SELECT * FROM ${table} WHERE ${key}=?`,[id]);
        if(old){if(old.value!==json)fail('IDENTITY_CONFLICT','Changed immutable registration/event');return {row:decode(old),retry:true};}
        const row={[key]:id,...fields,ordinal:number(ord),value:json};encodedRow(row);const names=Object.keys(row);query(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(()=>'?').join(',')})`,Object.values(row),'run');return {row:decode(row),retry:false};
    }
    function addSubject(id,kind,natural=null,ord=0){uuid(id);const old=query('SELECT * FROM catalog_subjects WHERE subject_id=?',[id]);if(old){if(old.kind!==kind||old.natural_key!==natural)fail('IDENTITY_CONFLICT','Subject identity changed');return;}
        if(natural!==null&&query('SELECT subject_id FROM catalog_subjects WHERE kind=? AND natural_key=?',[kind,natural]))fail('IDENTITY_CONFLICT','Natural identity already anchored');
        query('INSERT INTO catalog_subjects VALUES (?,?,?,?)',[id,kind,natural,number(ord)],'run');
    }
    function ref(id){return need('catalog_evidence_refs','evidence_ref_id',uuid(id));}
    function assertion(id,cap){const r=need('catalog_provenance','assertion_id',uuid(id));if(cap&&r.value.captureKey!==cap)fail('INVALID_REFERENCE','Assertion scope differs from capture');return r;}
    function artifactIdentity(v){const owner=v.owner;object(owner);string(owner.kind);string(owner.key);string(v.field);string(v.format);safeReference(v.path);if(!HEX.test(v.hash))fail('INVALID_IDENTITY','Artifact hash required');number(v.bytes);
        let original;
        if(owner.kind==='record'){
            const k=captureKey(owner.key);const cap=need('catalog_captures','capture_key',k);
            original=v.field==='output'?query('SELECT path,hash,bytes FROM outputs WHERE collection=? AND replay_id=? AND fingerprint=?',[cap.collection,cap.replay_id,cap.fingerprint]):query('SELECT path,hash,bytes,encoding FROM payloads WHERE owner_kind=? AND owner_key=? AND pointer=?',['record',k,v.field]);
        }else if(owner.kind==='map')original=query('SELECT path,hash FROM maps WHERE key=?',[owner.key]);
        else if(owner.kind==='review')original=query('SELECT path,hash,bytes,encoding FROM payloads WHERE owner_kind=? AND owner_key=? AND pointer=?',['review',owner.key,v.field]);
        else fail('UNSUPPORTED_OPERATION','C1 cannot own catalog body files');
        if(!original||original.path!==v.path||original.hash!==v.hash||(has(original,'bytes')&&original.bytes!==v.bytes)||(original.encoding&&original.encoding!==v.format))fail('INVALID_REFERENCE','Artifact must match registered synthetic evidence');
        return owner;
    }
    function evidence(v){uuid(v.evidenceRefId);const cap=captureKey(v.captureKey);const c=need('catalog_captures','capture_key',cap);range(v.range);if(v.actor){object(v.actor);if(v.actor.replayId!==c.replay_id)fail('INVALID_REFERENCE','Actor replay differs');string(v.actor.id);}
        if(v.artifactId){const a=need('catalog_artifacts','artifact_id',uuid(v.artifactId));if(a.owner_kind==='record'&&a.owner_key!==cap||a.owner_kind==='review'&&JSON.parse(a.owner_key)[0]!==cap)fail('INVALID_REFERENCE','Cross-capture artifact');if(a.owner_kind==='map'&&!v.mapAssociationAssertionId)fail('INVALID_REFERENCE','Map association assertion required');}
        const fields={buildAssertionId:['runtime-build','build'],configAssertionId:['configuration','config'],mapAssociationAssertionId:['map-association','map']};
        for(const [name,allowed] of Object.entries(fields))if(v[name]){const a=assertion(v[name],cap);if(!allowed.includes(a.field))fail('INVALID_REFERENCE','Assertion field differs from evidence role');}
        return {cap};
    }
    function checkpoint(v,kind){
        uuid(v.eventId);task(v.taskId);string(v.reason);const sub=subjectRow(uuid(v.subjectId));if(!['run','conclusion','experiment'].includes(sub.kind)||kind&&sub.kind!==kind)fail('INVALID_REFERENCE','Workflow subject kind');
        const old=query('SELECT * FROM catalog_workflow_events WHERE event_id=?',[v.eventId]);if(old){if(!eq(JSON.parse(old.value),v))fail('IDENTITY_CONFLICT','Workflow retry changed');return decode(old);}
        const [table,key]=tables[sub.kind],r=need(table,'subject_id',v.subjectId);if(r.workflow!==v.expectedState)fail('INVALID_STATE','Workflow expected state differs');
        if(v.nextState!==r.workflow){const edges=sub.kind==='run'?{planned:['running','cancelled'],running:['errored','cancelled']}:{open:['active','deferred','closed'],active:['deferred','closed'],deferred:['active','closed'],closed:['active']};
            if(!edges[r.workflow]?.includes(v.nextState))fail('INVALID_STATE','Invalid workflow edge');
            if(sub.kind==='run'&&v.nextState==='running'&&!r.sealed)fail('INVALID_STATE','Run must be sealed');
        }else if(sub.kind==='run'&&['completed','errored','cancelled'].includes(r.workflow))fail('INVALID_STATE','Terminal run immutable');
        const ord=query('SELECT COALESCE(MAX(ordinal),-1)+1 n FROM catalog_workflow_events WHERE subject_id=?',[v.subjectId]).n;
        const result=put('catalog_workflow_events','event_id',v.eventId,v,{subject_id:v.subjectId,task_id:v.taskId,previous:r.workflow,next:v.nextState},ord);
        query(`UPDATE ${table} SET workflow=? WHERE ${key}=?`,[v.nextState,r[key]],'run');return result.row;
    }
    function checkVerdict(v){if(v.verdict!==null&&!verdicts.includes(v.verdict))fail('INVALID_STATE','Invalid verdict');if(v.verdict!==null){string(v.semanticsVersion);string(v.criterion);string(v.unit);object(v.counts);for(const k of verdicts)number(v.counts[k]);if(v.opportunities!==null)number(v.opportunities);if(v.aggregate===true&&aggregateVerdicts(v.counts)!==v.verdict)fail('INVALID_REFERENCE','Aggregate hides incomplete candidates');if(v.verdict==='unexercised'&&(v.coverageSufficient!==true||v.opportunities!==0))fail('INVALID_REFERENCE','Unexercised needs covered absence of opportunities');if(['passed','failed'].includes(v.verdict)&&(v.level!=='command'&&v.level!=='position'&&v.level!=='outcome'||v.provenanceState!=='established'||v.coverageSufficient!==true))fail('INVALID_REFERENCE','Supported verdict needs level, provenance and coverage receipt');}}
    function support(series,v){
        const claimed=scopeInterval(v.scope),coverage=new Map();let readBytes=0;
        for(const [ordinal,s] of (v.support??[]).entries()){
            const f=need('catalog_findings','finding_id',uuid(s.findingId)),r=need('catalog_runs','run_id',f.run_id);if(r.workflow!=='completed')fail('INVALID_STATE','Support needs published findings');
            const q=need('catalog_questions','question_id',series.question_id);
            if(r.question_id!==series.question_id){
                if(typeof s.comparisonLink!=='string')fail('INVALID_REFERENCE','Explicit comparison link required');const link=need('catalog_question_links','link_key',s.comparisonLink);
                if(link.question_id!==series.question_id||link.related_question_id!==r.question_id||link.role!=='comparison')fail('INVALID_REFERENCE','Comparison link differs');
                const policy=link.value.policy,allowed=scopeInterval(policy.scope);
                if(allowed&&(!claimed||!contains(allowed,claimed)))fail('INVALID_REFERENCE','Conclusion outside authorized comparison interval');
                for(const [key,value] of Object.entries(policy.scope))if(!['range','ticks'].includes(key)&&(!v.scope||!has(v.scope,key)||!eq(v.scope[key],value)))fail('INVALID_REFERENCE','Conclusion outside comparison scope');
                for(const key of ['criterion','unit'])if(has(policy,key)&&policy[key]!==v[key])fail('INVALID_REFERENCE','Comparison criterion/units differ');
            }
            if(f.value.criterion!==v.criterion||f.value.unit!==v.unit||q.value.criterion!==v.criterion||q.value.unit!==v.unit)fail('INVALID_REFERENCE','Criterion/units differ');
            // A C1 finding's complete links fit one result-input page. Multiple
            // findings may span several such pages within the byte budget.
            const links=query('SELECT * FROM catalog_finding_evidence WHERE finding_id=? ORDER BY ordinal LIMIT ?',[s.findingId,LIMITS.page+1],'all');
            if(links.length>LIMITS.page)fail('RESOURCE_LIMIT','Finding evidence page budget');if(!links.length)fail('INVALID_REFERENCE','Support needs exact evidence');
            const findingScope=scopeInterval(f.value.scope);let relevant=!claimed,unknownInterval=false;
            if(claimed&&findingScope&&!overlaps(claimed,findingScope))fail('INVALID_REFERENCE','Finding outside conclusion interval');
            for(const link of links){
                const e=ref(link.evidence_ref_id);readBytes+=Buffer.byteLength(encodedRow(link))+Buffer.byteLength(encodedRow(e));if(readBytes>LIMITS.pageBytes)fail('RESOURCE_LIMIT','Selected support evidence byte budget');
                if(!claimed)continue;range(e.value.range);if(e.value.range?.start===undefined){unknownInterval=true;continue;}
                let interval={...e.value.range,dimension:e.value.range.dimension??'runtime-tick'};
                if(findingScope){if(!overlaps(interval,findingScope))continue;interval={...interval,start:Math.max(interval.start,findingScope.start),end:Math.min(interval.end,findingScope.end)};}
                if(!overlaps(interval,claimed))continue;relevant=true;
                // Never fill one replay/dimension's gap with another's ticks.
                const provenance=['buildAssertionId','configAssertionId','mapAssociationAssertionId'].map(name=>{
                    if(!e.value[name])return {present:false};const a=assertion(e.value[name],e.capture_key).value;
                    return {present:true,state:a.state,...(has(a,'value')?{value:a.value}:{})};
                });
                const key=inlineJson([JSON.parse(e.capture_key)[1],interval.dimension,provenance]);if(!coverage.has(key))coverage.set(key,[]);coverage.get(key).push(interval);
            }
            if(!relevant&&!((v.verdict===null||v.verdict==='unknown')&&unknownInterval))fail('INVALID_REFERENCE','Support has no evidence in conclusion scope');
            put('catalog_conclusion_support','link_key',inlineJson([v.conclusionId,v.revision,ordinal]),s,{conclusion_id:v.conclusionId,revision:v.revision,finding_id:s.findingId,role:s.role},ordinal);
        }
        if(v.verdict!==null&&!(v.support?.length))fail('INVALID_REFERENCE','Assessed conclusion needs support');
        if(claimed&&['passed','failed','unexercised'].includes(v.verdict)&&(!coverage.size||[...coverage.values()].some(ranges=>!covers(ranges,claimed))))fail('INVALID_REFERENCE','Supported conclusion exceeds linked interval coverage');
    }
    function revision(v,kind){
        const isConclusion=kind==='conclusion',id=v[isConclusion?'conclusionId':'experimentId'];uuid(id);uuid(v.revisionSubjectId);task(v.taskId);
        const table=isConclusion?'catalog_conclusion_revisions':'catalog_experiment_revisions';const old=query(`SELECT * FROM ${table} WHERE subject_id=?`,[v.revisionSubjectId]);if(old){if(isConclusion?old.input_digest!==digest(v):!eq(JSON.parse(old.value),v))fail('IDENTITY_CONFLICT','Revision retry changed');return decode(old);}
        const series=need(tables[kind][0],tables[kind][1],id);number(v.expectedRevision);number(v.revision);
        if(series.current_revision!==v.expectedRevision)fail('REVISION_CONFLICT','Stale revision head');
        if(v.revision!==v.expectedRevision+1||v.predecessor!==(v.revision===1?null:v.revision-1))fail('INVALID_REFERENCE','Invalid predecessor');
        if(isConclusion)checkVerdict(v);else {string(v.hypothesis);need('catalog_questions','question_id',uuid(v.questionId));object(v.criteria);for(const k of ['acceptance','failure','unexercised'])string(v.criteria[k]);for(const arm of ['baseline','candidate']){object(v[arm]);for(const [name,k] of [['buildId','build'],['configId','config']])if(v[arm][name]!==null)need(tables[k][0],tables[k][1],v[arm][name]);}}
        addSubject(v.revisionSubjectId,kind+'-revision',inlineJson([id,v.revision]),v.revision);
        const fields={[isConclusion?'conclusion_id':'experiment_id']:id,revision:v.revision,predecessor:v.predecessor,task_id:v.taskId,...(isConclusion?{verdict:v.verdict,input_digest:digest(v)}:{question_id:v.questionId})};
        const metadata={...v};delete metadata.support;
        const result=put(table,'subject_id',v.revisionSubjectId,isConclusion?metadata:v,fields,v.revision).row;
        if(isConclusion)support(series,v);
        query(`UPDATE ${tables[kind][0]} SET current_revision=? WHERE ${tables[kind][1]}=?`,[v.revision,id],'run');return result;
    }
    const methods={
        registerIdentity(v){object(v);const {kind,id,subjectId,ordinal:ord=0}=v;const spec=tables[kind];if(!spec||['run','question','finding','conclusion-revision','experiment-revision'].includes(kind))fail('INVALID_IDENTITY','Use typed creation API');
            let key=id,fields={subject_id:uuid(subjectId)},natural=id;
            if(kind==='replay'){if(!REPLAY.test(id))fail('INVALID_IDENTITY','Replay ID');}
            else if(kind==='capture'){key=captureKey(v.capture);const [collection,replayId,fingerprint]=JSON.parse(key);need('catalog_replays','replay_id',replayId);fields={...fields,collection,replay_id:replayId,fingerprint};natural=key;}
            else if(kind==='upload'){string(v.playerKey);if(!REPLAY.test(v.codeId))fail('INVALID_IDENTITY','Uploaded code ID');key=inlineJson([v.playerKey,v.codeId]);natural=key;fields={...fields,player_key:v.playerKey,code_id:v.codeId};}
            else if(kind==='build'){if(!HEX.test(id))fail('INVALID_IDENTITY','Build ID');}
            else if(kind==='artifact'){
                uuid(id);
                // An exact historical retry must still work after its operational
                // owner retires. Only new references validate current ownership.
                const old=query('SELECT * FROM catalog_artifacts WHERE artifact_id=?',[id]);
                if(old){if(!eq(JSON.parse(old.value),v))fail('IDENTITY_CONFLICT','Registration retry differs');return decode(old);}
                const owner=artifactIdentity(v);fields={...fields,owner_kind:owner.kind,owner_key:owner.key,field:v.field,format:v.format,hash:v.hash,bytes:v.bytes,path:v.path};natural=inlineJson([owner,v.field,v.format]);
            }
            else if(kind==='conclusion'){uuid(id);need('catalog_questions','question_id',uuid(v.questionId));fields={...fields,question_id:v.questionId,current_revision:0,workflow:'open'};}
            else if(kind==='experiment'){uuid(id);fields={...fields,current_revision:0,workflow:'open'};}
            else if(kind==='task')string(id,'exact task ID');else uuid(id);
            const old=query(`SELECT * FROM ${spec[0]} WHERE ${spec[1]}=?`,[key]);if(old){if(!eq(JSON.parse(old.value),v))fail('IDENTITY_CONFLICT','Registration retry differs');return decode(old);}
            addSubject(subjectId,kind,natural,ord);const result=put(spec[0],spec[1],key,v,fields,ord).row;
            if(['conclusion','experiment'].includes(kind)){task(v.taskId);uuid(v.eventId);put('catalog_workflow_events','event_id',v.eventId,{...v,creation:true},{subject_id:subjectId,task_id:v.taskId,previous:null,next:'open'},0);}
            return result;
        },
        createQuestion(v){uuid(v.questionId);uuid(v.subjectId);string(v.question);string(v.criterion);string(v.unit);object(v.requiredEvidence);object(v.comparisonPolicy);if(v.predecessor)need('catalog_questions','question_id',uuid(v.predecessor));addSubject(v.subjectId,'question',v.questionId,v.ordinal??0);return put('catalog_questions','question_id',v.questionId,v,{subject_id:v.subjectId,predecessor:v.predecessor??null},v.ordinal??0).row;},
        linkQuestions(v){task(v.taskId);for(const id of [v.questionId,v.relatedQuestionId])need('catalog_questions','question_id',uuid(id));if(v.questionId===v.relatedQuestionId||!['comparison','predecessor'].includes(v.role))fail('INVALID_REFERENCE','Invalid question relationship');object(v.policy);if(v.role==='comparison'){if(!v.policy.scope||!Object.keys(object(v.policy.scope)).length)fail('INVALID_REFERENCE','Comparison needs explicit scope');range(v.policy.scope.range);}string(v.reason);return put('catalog_question_links','link_key',inlineJson([v.questionId,v.relatedQuestionId,v.role]),v,{question_id:v.questionId,related_question_id:v.relatedQuestionId,role:v.role,task_id:v.taskId},v.ordinal??0).row;},
        appendEvidenceRef(v){const {cap}=evidence(v);return put('catalog_evidence_refs','evidence_ref_id',v.evidenceRefId,v,{capture_key:cap,artifact_id:v.artifactId??null},v.ordinal??0).row;},
        appendProvenance(v){uuid(v.assertionId);const sub=subjectRow(uuid(v.subjectId));if(!['replay','capture','upload','build','config'].includes(sub.kind))fail('INVALID_REFERENCE','Provenance subject kind');string(v.field);string(v.reason);string(v.validatorVersion);if(!knowledge.includes(v.state))fail('INVALID_REFERENCE','Unknown knowledge state');
            if(v.evidenceRefId){const e=ref(v.evidenceRefId);if(v.captureKey!==e.capture_key)fail('INVALID_REFERENCE','Provenance scope mismatch');if(sub.kind==='capture'&&need('catalog_captures','subject_id',v.subjectId).capture_key!==e.capture_key)fail('INVALID_REFERENCE','Provenance capture differs');if(sub.kind==='replay'&&need('catalog_replays','subject_id',v.subjectId).replay_id!==need('catalog_captures','capture_key',e.capture_key).replay_id)fail('INVALID_REFERENCE','Provenance replay differs');}else {if(!['user','local-source'].includes(v.origin?.kind)&&v.state!=='unknown')fail('INVALID_REFERENCE','Explicit origin required');}
            return put('catalog_provenance','assertion_id',v.assertionId,v,{subject_id:v.subjectId,field:v.field,evidence_ref_id:v.evidenceRefId??null,state:v.state},v.ordinal??0).row;
        },
        appendCoverage(v){uuid(v.coverageId);const cap=captureKey(v.captureKey);need('catalog_captures','capture_key',cap);if(!['runtime-tick','game-time','diagnostic-type','frame','terminal'].includes(v.dimension)||!coverageStates.includes(v.state))fail('INVALID_REFERENCE','Coverage dimension/state');range(v.range);string(v.reason);string(v.validatorVersion);if(v.state==='covered'&&!v.evidenceRefId)fail('INVALID_REFERENCE','Covered interval needs evidence');if(v.evidenceRefId&&ref(v.evidenceRefId).capture_key!==cap)fail('INVALID_REFERENCE','Coverage source differs');return put('catalog_coverage','coverage_id',v.coverageId,v,{capture_key:cap,dimension:v.dimension,start:v.range?.start??null,end:v.range?.end??null,evidence_ref_id:v.evidenceRefId??null},v.ordinal??0).row;},
        createRun(v){uuid(v.runId);uuid(v.subjectId);need('catalog_questions','question_id',uuid(v.questionId));task(v.taskId);uuid(v.eventId);object(v.analyzer);string(v.analyzer.name);string(v.analyzer.version);if(!HEX.test(v.analyzer.dependencyDigest))fail('INVALID_IDENTITY','Analyzer dependency digest');object(v.parameters);addSubject(v.subjectId,'run',v.runId,v.ordinal??0);const r=put('catalog_runs','run_id',v.runId,v,{subject_id:v.subjectId,question_id:v.questionId,workflow:'planned',sealed:0,selection_digest:null,source_count:null,result_digest:null},v.ordinal??0);if(!r.retry)put('catalog_workflow_events','event_id',v.eventId,{...v,creation:true},{subject_id:v.subjectId,task_id:v.taskId,previous:null,next:'planned'},0);return r.row;},
        appendRunSources(v){const r=need('catalog_runs','run_id',uuid(v.runId));if(r.workflow!=='planned'||r.sealed)fail('INVALID_STATE','Frozen selection');if(!Array.isArray(v.sources)||v.sources.length>LIMITS.sources)fail('RESOURCE_LIMIT','Source page exceeds selection limit');for(const s of v.sources){countInput(s);const cap=captureKey(s.captureKey);need('catalog_captures','capture_key',cap);number(s.ordinal);range(s.range);if(!['not-checked','pending','retired','missing'].includes(s.availability))fail('INVALID_REFERENCE','Source availability');object(s.fingerprints);for(const hash of Object.values(s.fingerprints))if(hash!==null&&!HEX.test(hash))fail('INVALID_IDENTITY','Source digest');put('catalog_run_sources','source_key',inlineJson([v.runId,s.ordinal]),s,{run_id:v.runId,capture_key:cap},s.ordinal);}if(query('SELECT count(*) n FROM catalog_run_sources WHERE run_id=?',[v.runId]).n>LIMITS.sources)fail('RESOURCE_LIMIT','Run source limit');},
        sealRun(v){const r=need('catalog_runs','run_id',uuid(v.runId));string(v.semanticsVersion);const sources=query('SELECT * FROM catalog_run_sources WHERE run_id=? ORDER BY ordinal LIMIT 65',[v.runId],'all');if(sources.length>LIMITS.sources)fail('RESOURCE_LIMIT','Selection too large');sources.forEach((s,i)=>{if(s.ordinal!==i)fail('INVALID_REFERENCE','Noncontiguous selection');});const logical=sources.map(s=>JSON.parse(s.value));const hash=digest({version:v.semanticsVersion,question:need('catalog_questions','question_id',r.question_id).value,analyzer:r.value.analyzer,parameters:r.value.parameters,sources:logical});if(r.sealed){if(r.selection_digest!==hash)fail('IDENTITY_CONFLICT','Seal changed');return hash;}if(r.workflow!=='planned')fail('INVALID_STATE','Seal requires planned');query('UPDATE catalog_runs SET sealed=1,selection_digest=?,selection_version=?,source_count=? WHERE run_id=?',[hash,v.semanticsVersion,sources.length,v.runId],'run');return hash;},
        transitionRun(v){return checkpoint(v,'run');}, transitionWorkflow(v){return checkpoint(v);},
        publishRunResult(v){const r=need('catalog_runs','run_id',uuid(v.runId));const hash=digest(v);if(r.workflow==='completed'){if(r.result_digest!==hash)fail('IDENTITY_CONFLICT','Result retry differs');return r;}
            if(r.workflow!=='running'||v.expectedState!=='running'||!r.sealed)fail('INVALID_STATE','Publication requires running sealed run');task(v.taskId);uuid(v.eventId);
            const findings=v.findings??[],refs=v.evidenceRefs??[];if(!Array.isArray(findings)||!Array.isArray(refs))fail('INVALID_JSON','Result arrays');object(v.declaredCounts);if(v.declaredCounts.findings!==findings.length||v.declaredCounts.evidenceLinks!==findings.reduce((n,f)=>n+(f.evidence?.length??0),0)||v.declaredCounts.evidenceRefs!==refs.length)fail('INVALID_REFERENCE','Declared counts differ');
            context.resultRun=v.runId;try{for(const e of refs){countInput(e);methods.appendEvidenceRef(e);}for(const [ordinal,f] of findings.entries()){const {evidence,...metadata}=f;countInput(metadata);methods.appendFinding({...f,runId:v.runId,ordinal});}}finally{context.resultRun=null;}
            const published=query('SELECT finding_id,ordinal FROM catalog_findings WHERE run_id=? ORDER BY ordinal LIMIT ?',[v.runId,LIMITS.page+1],'all');
            if(published.length!==findings.length)fail('INVALID_REFERENCE','Published finding count differs');
            for(const [ordinal,f] of findings.entries()){
                const links=query('SELECT ordinal FROM catalog_finding_evidence WHERE finding_id=? ORDER BY ordinal LIMIT ?',[f.findingId,LIMITS.page+1],'all');
                if(published[ordinal].finding_id!==f.findingId||published[ordinal].ordinal!==ordinal||!links.length||links.length!==f.evidence.length||links.some((r,i)=>r.ordinal!==i))fail('INVALID_REFERENCE','Incomplete per-finding evidence publication');
            }
            query('UPDATE catalog_runs SET workflow=?,result_digest=? WHERE run_id=?',['completed',hash,v.runId],'run');const ord=query('SELECT COALESCE(MAX(ordinal),-1)+1 n FROM catalog_workflow_events WHERE subject_id=?',[r.subject_id]).n;
            const receipt={...v};delete receipt.findings;delete receipt.evidenceRefs;
            put('catalog_workflow_events','event_id',v.eventId,{...receipt,resultDigest:hash},{subject_id:r.subject_id,task_id:v.taskId,previous:'running',next:'completed'},ord);return need('catalog_runs','run_id',v.runId);
        },
        appendFinding(v){if(context.resultRun!==v.runId)fail('INVALID_STATE','Finding only inside atomic result');uuid(v.findingId);uuid(v.subjectId);checkVerdict(v);const r=need('catalog_runs','run_id',v.runId),q=need('catalog_questions','question_id',r.question_id);if(v.criterion!==q.value.criterion||v.unit!==q.value.unit)fail('INVALID_REFERENCE','Finding criterion differs');string(v.kind);string(v.rule);if(v.originalVerdict!==undefined&&({pass:'passed',fail:'failed',unknown:'unknown',unexercised:'unexercised'}[v.originalVerdict]!==v.verdict))fail('INVALID_REFERENCE','Analyzer verdict mapping differs');addSubject(v.subjectId,'finding',v.findingId,v.ordinal);const {evidence,...metadata}=v;put('catalog_findings','finding_id',v.findingId,metadata,{subject_id:v.subjectId,run_id:v.runId,verdict:v.verdict},v.ordinal);
            if(!Array.isArray(v.evidence)||!v.evidence.length)fail('INVALID_REFERENCE','Finding needs evidence');for(const [ordinal,e] of v.evidence.entries()){object(e);if(has(e,'findingId')&&e.findingId!==v.findingId)fail('INVALID_REFERENCE','Child evidence parent differs');countInput(e);methods.appendFindingEvidence({...e,findingId:v.findingId,ordinal});}
        },
        appendFindingEvidence(v){const f=need('catalog_findings','finding_id',uuid(v.findingId));if(context.resultRun!==f.run_id)fail('INVALID_STATE','Evidence links only in result transaction');const e=ref(v.evidenceRefId);const selected=query('SELECT * FROM catalog_run_sources WHERE run_id=? AND capture_key=?',[f.run_id,e.capture_key]);if(!selected)fail('INVALID_REFERENCE','Evidence outside sealed selection');const s=JSON.parse(selected.value);
            // Use the same nullish runtime-tick default as conclusion scopes.
            // C1 has no domain-conversion API: equal bounds or opaque alignment
            // metadata cannot authorize evidence outside the sealed domain.
            if(s.range&&(s.range.dimension??'runtime-tick')!==(e.value.range?.dimension??'runtime-tick'))fail('INVALID_REFERENCE','Evidence outside selected domain');
            if(s.range?.start!==undefined&&(e.value.range?.start===undefined||e.value.range.start<s.range.start||e.value.range.end>s.range.end))fail('INVALID_REFERENCE','Evidence outside selected range');if(f.verdict!=='unknown'){
            if(s.validation?.state!=='verified'||s.availability!=='not-checked')fail('INVALID_REFERENCE','Supported finding needs selected validation receipt');
            for(const name of ['buildAssertionId','configAssertionId','mapAssociationAssertionId'])if(e.value[name]&&!['observed','local-verified'].includes(assertion(e.value[name],e.capture_key).state))fail('INVALID_REFERENCE','Supported finding has unresolved provenance');
        }if(!['observation','coverage','provenance','counterevidence'].includes(v.role))fail('INVALID_REFERENCE','Evidence support role');put('catalog_finding_evidence','link_key',inlineJson([v.findingId,v.ordinal]),v,{finding_id:v.findingId,evidence_ref_id:v.evidenceRefId,role:v.role},v.ordinal);},
        appendConclusionRevision(v){for(const s of v.support??[])countInput(s);return revision(v,'conclusion');},
        appendSupport(){fail('INVALID_STATE','Supply complete support to appendConclusionRevision');},
        appendExperimentRevision(v){return revision(v,'experiment');},
        linkExperimentRun(v){const rev=query('SELECT * FROM catalog_experiment_revisions WHERE experiment_id=? AND revision=?',[uuid(v.experimentId),number(v.revision)]);if(!rev)fail('INVALID_REFERENCE','Missing experiment revision');const rv=JSON.parse(rev.value),r=need('catalog_runs','run_id',uuid(v.runId));if(r.question_id!==rv.questionId)fail('INVALID_REFERENCE','Experiment question differs');if(!['baseline','candidate','observational','unknown'].includes(v.arm))fail('INVALID_REFERENCE','Unknown arm');object(v.assignmentProvenance);return put('catalog_experiment_runs','link_key',inlineJson([v.experimentId,v.revision,v.runId]),v,{experiment_id:v.experimentId,revision:v.revision,run_id:v.runId,arm:v.arm},v.ordinal??0).row;},
        appendReviewEvent(v){uuid(v.eventId);subjectRow(uuid(v.targetSubjectId));task(v.taskId);const old=query('SELECT * FROM catalog_review_events WHERE event_id=?',[v.eventId]);if(old){if(!eq(JSON.parse(old.value),v))fail('IDENTITY_CONFLICT','Review retry changed');return decode(old);}const key=inlineJson([v.targetSubjectId,v.taskId]),r=query('SELECT * FROM catalog_reviews WHERE review_key=?',[key]);const expected=r?.checkpoint??'unclaimed';if(v.expectedState!==expected||({unclaimed:'claimed',claimed:'examined',examined:'completed'}[expected]!==v.checkpoint))fail('INVALID_STATE','Invalid review checkpoint');string(v.reason);const ord=query('SELECT COALESCE(MAX(ordinal),-1)+1 n FROM catalog_review_events WHERE target_subject_id=? AND task_id=?',[v.targetSubjectId,v.taskId]).n;put('catalog_review_events','event_id',v.eventId,v,{target_subject_id:v.targetSubjectId,task_id:v.taskId,checkpoint:v.checkpoint},ord);if(r)query('UPDATE catalog_reviews SET checkpoint=? WHERE review_key=?',[v.checkpoint,key],'run');else put('catalog_reviews','review_key',key,{targetSubjectId:v.targetSubjectId,taskId:v.taskId},{target_subject_id:v.targetSubjectId,task_id:v.taskId,checkpoint:v.checkpoint},v.ordinal??0);},
        appendArtifactEvent(v){uuid(v.eventId);need('catalog_artifacts','artifact_id',uuid(v.artifactId));task(v.taskId);if(v.kind!=='availability'&&v.kind!=='retirement-receipt')fail('UNSUPPORTED_OPERATION','C1 has no relocation');string(v.reason);object(v.receipt);return put('catalog_artifact_events','event_id',v.eventId,v,{artifact_id:v.artifactId,task_id:v.taskId},v.ordinal).row;},
        appendProperty(v){subjectRow(uuid(v.subjectId));string(v.pointer);if(!/^(?:\/(?:[^~]|~[01])*)+$/.test(v.pointer))fail('INVALID_REFERENCE','JSON pointer required');const old=query('SELECT * FROM catalog_properties WHERE subject_id=? AND pointer=?',[v.subjectId,v.pointer]);const json=inlineJson(v.value);if(old){if(old.value!==json||old.ordinal!==v.ordinal)fail('IDENTITY_CONFLICT','Property retry differs');return decode(old);}encodedRow({subject_id:v.subjectId,pointer:v.pointer,ordinal:number(v.ordinal),value:json});query('INSERT INTO catalog_properties VALUES (?,?,?,?)',[v.subjectId,v.pointer,v.ordinal,json],'run');}
    };
    return {transaction(callback){return core.transaction(()=>{
        context={rows:0,bytes:0,resultRun:null};let active=true,failed=false;
        const api=Object.fromEntries(Object.entries(methods).map(([name,fn])=>[name,v=>{if(!active)fail('CLOSED','Catalog transaction ended');if(failed)fail('INVALID_STATE','Transaction poisoned by rejected input');try{countCall(name,v);return fn(v);}catch(e){failed=true;throw e;}}]));
        try{const result=callback(api);if(failed)fail('INVALID_STATE','Rejected operation cannot commit');return result;}finally{active=false;context=null;}
    });}};
}

function attach({store,read,stmt,generation,write,snapshot}){
    const get=(db,table,key,value)=>decode(stmt(db,`SELECT * FROM ${table} WHERE ${key}=?`,[value]))??{kind:'missing'};
    function page(db,table,key,where,params,cursor,limit=LIMITS.page){if(!Number.isSafeInteger(limit)||limit<1||limit>LIMITS.page)fail('RESOURCE_LIMIT','Page limit');const gen=generation(db),domain=inlineJson([table,key,where,params,limit]);if(cursor&&(cursor.storeId!==store.storeId||cursor.generation!==String(gen)||cursor.query!==domain))fail('STALE_CURSOR','Cursor store/generation/query differs');const last=cursor?.last??[-1,''];if(!Array.isArray(last)||last.length!==2)fail('STALE_CURSOR','Malformed cursor');const rows=stmt(db,`SELECT * FROM ${table} WHERE ${where} AND (ordinal>? OR (ordinal=? AND ${key}>?)) ORDER BY ordinal,${key} LIMIT ?`,[...params,last[0],last[0],last[1],limit],'all');let bytes=0;for(const row of rows){bytes+=Buffer.byteLength(encodedRow(row));if(bytes>LIMITS.pageBytes)fail('RESOURCE_LIMIT','Page bytes');}const end=rows.at(-1);return {rows:rows.map(decode),generation:gen,cursor:end&&rows.length===limit?{storeId:store.storeId,generation:String(gen),query:domain,last:[end.ordinal,end[key]]}:null};}
    function availability(db,cap){const c=get(db,'catalog_captures','capture_key',cap);if(c.kind==='missing')return 'missing';if(stmt(db,'SELECT id FROM operations WHERE collection=? AND replay_id=? AND fingerprint=? LIMIT 1',[c.collection,c.replay_id,c.fingerprint]))return 'pending';const r=stmt(db,'SELECT status FROM records WHERE key=?',[cap]);if(r)return ['claim','done'].includes(r.status)?'not-checked':'pending';return stmt(db,'SELECT key FROM retired WHERE key=?',[cap])?'retired':'missing';}
    const resolve=(db,id)=>{const e=get(db,'catalog_evidence_refs','evidence_ref_id',uuid(id));if(e.kind==='missing')return e;const a=e.artifact_id?get(db,'catalog_artifacts','artifact_id',e.artifact_id):null;return {reference:e,artifact:a,availability:availability(db,e.capture_key),historicalReceipt:e.value};};
    const catalog={
        root:store.root,storeId:store.storeId,evidence:store,metrics:store.metrics,resetMetrics:()=>store.resetMetrics(),close:()=>store.close(),
        withWriter:write,
        getReplay:id=>{if(!REPLAY.test(id))fail('INVALID_IDENTITY','Replay ID');return read(db=>get(db,'catalog_replays','replay_id',id));},
        getCapture:key=>read(db=>{const cap=captureKey(key);return {...get(db,'catalog_captures','capture_key',cap),availability:availability(db,cap)};}),
        getRun:id=>read(db=>get(db,'catalog_runs','run_id',uuid(id))),
        getConclusion:(id,rev)=>read(db=>rev===undefined?get(db,'catalog_conclusions','conclusion_id',uuid(id)):decode(stmt(db,'SELECT * FROM catalog_conclusion_revisions WHERE conclusion_id=? AND revision=?',[uuid(id),number(rev)]))??{kind:'missing'}),
        getExperiment:(id,rev)=>read(db=>rev===undefined?get(db,'catalog_experiments','experiment_id',uuid(id)):decode(stmt(db,'SELECT * FROM catalog_experiment_revisions WHERE experiment_id=? AND revision=?',[uuid(id),number(rev)]))??{kind:'missing'}),
        pageReplays:(filters={},cursor)=>{if(Object.keys(filters).some(k=>k!=='limit'))fail('INVALID_REFERENCE','Unsupported filter');return read(db=>page(db,'catalog_replays','replay_id','1=1',[],cursor,filters.limit));},
        pageCaptures:(replayId,cursor,limit)=>read(db=>page(db,'catalog_captures','capture_key',replayId===null?'1=1':'replay_id=?',replayId===null?[]:[replayId],cursor,limit)),
        pageRunSources:(id,cursor)=>read(db=>page(db,'catalog_run_sources','source_key','run_id=?',[uuid(id)],cursor)),
        pageFindings:(id,filters={},cursor)=>read(db=>{if(Object.keys(filters).some(k=>!['verdict','limit'].includes(k))||filters.verdict&&!verdicts.includes(filters.verdict))fail('INVALID_REFERENCE','Finding filter');return page(db,'catalog_findings','finding_id','run_id=?'+(filters.verdict?' AND verdict=?':''),[uuid(id),...(filters.verdict?[filters.verdict]:[])],cursor,filters.limit);}),
        pageEvidence:(id,cursor)=>read(db=>page(db,'catalog_finding_evidence','link_key','finding_id=?',[uuid(id)],cursor)),
        pageSupport:(id,rev,cursor)=>read(db=>page(db,'catalog_conclusion_support','link_key','conclusion_id=? AND revision=?',[uuid(id),number(rev)],cursor)),
        pageConclusionHistory:(id,cursor)=>read(db=>page(db,'catalog_conclusion_revisions','subject_id','conclusion_id=?',[uuid(id)],cursor)),
        pageReviews:(id,cursor)=>read(db=>page(db,'catalog_reviews','review_key','target_subject_id=?',[uuid(id)],cursor)),
        pageProperties:(id,cursor)=>read(db=>page(db,'catalog_properties','pointer','subject_id=?',[uuid(id)],cursor)),
        pageProvenance:(id,cursor)=>read(db=>page(db,'catalog_provenance','assertion_id','subject_id=?',[uuid(id)],cursor)),
        pageCoverage:(cap,dimension,cursor)=>read(db=>page(db,'catalog_coverage','coverage_id','capture_key=? AND dimension=?',[captureKey(cap),dimension],cursor)),
        pageWorkflow:(id,cursor)=>read(db=>page(db,'catalog_workflow_events','event_id','subject_id=?',[uuid(id)],cursor)),
        pageReviewHistory:(id,taskId,cursor)=>read(db=>page(db,'catalog_review_events','event_id','target_subject_id=? AND task_id=?',[uuid(id),string(taskId)],cursor)),
        resolveEvidence:id=>read(db=>resolve(db,id)),
        async withCatalogSnapshot({captureKeys=[],runIds=[],evidenceRefIds=[],conclusionRevisions=[]}={},callback){
            if(captureKeys.length>LIMITS.sources||runIds.length+evidenceRefIds.length+conclusionRevisions.length>LIMITS.page)fail('RESOURCE_LIMIT','Snapshot selection exceeds bounds');
            const data=await snapshot(db=>{const captures=new Set(captureKeys.map(captureKey));let bytes=0;const values={captures:[],runs:[],evidence:[],conclusions:[]};const add=(name,row)=>{bytes+=Buffer.byteLength(encodedRow(row));if(bytes>LIMITS.pageBytes)fail('RESOURCE_LIMIT','Snapshot metadata bytes');values[name].push(row);};
                for(const id of evidenceRefIds){const r=resolve(db,id);if(r.reference)captures.add(r.reference.capture_key);add('evidence',r);}
                for(const id of runIds){const r=get(db,'catalog_runs','run_id',uuid(id));if(r.kind!=='missing'){const sources=stmt(db,'SELECT capture_key FROM catalog_run_sources WHERE run_id=? ORDER BY ordinal LIMIT 65',[id],'all');for(const s of sources)captures.add(s.capture_key);}add('runs',r);}
                for(const v of conclusionRevisions)add('conclusions',decode(stmt(db,'SELECT * FROM catalog_conclusion_revisions WHERE conclusion_id=? AND revision=?',[uuid(v.conclusionId),number(v.revision)]))??{kind:'missing'});
                if(captures.size>LIMITS.sources)fail('RESOURCE_LIMIT','Snapshot source closure exceeds limit');for(const cap of captures){const state=availability(db,cap);if(state==='pending')fail('UNAVAILABLE','Active selected intent/not-ready source');add('captures',{...get(db,'catalog_captures','capture_key',cap),availability:state});}return values;});
            let open=true;const view={get(name){if(!open)fail('CLOSED','Snapshot callback ended');if(!has(data,name))fail('INVALID_REFERENCE','Unknown snapshot collection');return structuredClone(data[name]);}};try{return await callback(view);}finally{open=false;}
        }
    };return catalog;
}

export function aggregateVerdicts(counts){for(const k of verdicts)number(counts[k]);for(const k of ['failed','unknown','passed','unexercised'])if(counts[k]>0)return k;return null;}
// Not a public SQL escape hatch: the core supplies its private connection to
// these typed constructors, and all resulting public methods close over it.
export const catalogDefinition=Object.freeze({schema:schema+guards,writer,attach});
