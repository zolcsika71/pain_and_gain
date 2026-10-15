// Shared command connections. Scope authorization stays outside this table.
import {consumerMode} from './replay-production-scope.js';
import {fail} from './replay-store-payloads.js';
const routes={
    import:['replay-import-command-fixture.js','importSyntheticCache',{collection:'log'}],
    'score-import':['replay-import-command-fixture.js','importSyntheticCache',{collection:'score'}],
    claim:['replay-log-review-fixture.js','updateSyntheticLogReview',{action:'claim'}],
    examined:['replay-log-review-fixture.js','updateSyntheticLogReview',{action:'examined'}],
    'score-claim':['replay-log-review-fixture.js','updateSyntheticScoreReview',{action:'claim'}],
    'score-examined':['replay-log-review-fixture.js','updateSyntheticScoreReview',{action:'examined'}],
    analyze:['replay-analysis-command-fixture.js','analyzeSyntheticReplay',{}],
    index:['replay-evidence-consumers-fixture.js','buildSyntheticHistoricalIndex',{}],
    screen:['replay-evidence-consumers-fixture.js','screenSyntheticReplay',{}],
    list:['replay-lifecycle-command-fixture.js','listSyntheticLogs',{}],
    maps:['replay-maintenance-command-fixture.js','listSyntheticMaps',{}],
    'migrate-status':['replay-maintenance-command-fixture.js','migrateSyntheticStatuses',{}],
    'register-local':['replay-maintenance-command-fixture.js','registerSyntheticLocalLog',{}],
    'upgrade-map-checksums':['replay-maintenance-command-fixture.js','checkSyntheticMapChecksums',{}],
    scan:['replay-scan-command-fixture.js','scanSyntheticCache',{}],
    watch:['replay-scan-command-fixture.js','watchSyntheticCache',{}],
};
for(const action of ['complete','done','reconcile','score-done','score-cleanup','score-verify'])routes[action]=['replay-lifecycle-command-fixture.js','runSyntheticLifecycle',{action}];
export const sqliteConsumerCommands=Object.freeze([...Object.keys(routes),'other']);
export async function runSqliteConsumer(root,command,options={},sink){
    if(!sqliteConsumerCommands.includes(command))fail('UNSUPPORTED_OPTION','Unsupported SQLite consumer');
    const mode=consumerMode(root);
    if(command==='other')return(await import('./replay-maintenance-command-fixture.js')).writeSyntheticOther({...options,...mode,root},sink);
    const [module,name,extra]=routes[command];return(await import('./'+module))[name]({...options,...extra,...mode,root});
}
