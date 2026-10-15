// Explicit synthetic retirement only. No production/legacy dispatcher.
import {fail} from './replay-store-payloads.js';

export async function retireFixtureScore(options) {
    if (options === null || typeof options !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(options))) fail('INVALID_ARGUMENT','Explicit plain options required');
    const names = ['root','schemaVersion','replayId','fingerprint'], descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).some(k=>!names.includes(k))) fail('UNSUPPORTED_OPTION','Unsupported retirement option');
    if (names.some(k=>!Object.hasOwn(descriptors,k)||!Object.hasOwn(descriptors[k],'value'))) fail('INVALID_ARGUMENT','Exactly four data properties required');
    const {root,schemaVersion,replayId,fingerprint} = options;
    if (typeof root !== 'string' || typeof schemaVersion !== 'number') fail('INVALID_ARGUMENT','Explicit root and numeric schema required');
    if (![1,2].includes(schemaVersion)) fail('UNSUPPORTED_STORE','Expected schema 1 or 2');
    if (typeof replayId !== 'string' || !/^[a-f0-9]{24}$/.test(replayId) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) fail('INVALID_IDENTITY','Exact score identity required');
    const handle = schemaVersion === 1 ? await (await import('./replay-store.js')).openStore({root,mode:'write'}) : await (await import('./replay-catalog.js')).openCatalog({root,mode:'write'});
    let failed = false;
    try { return await (handle.evidence ?? handle).withWriter(w=>w.retireScore({collection:'score',replayId,fingerprint})); }
    catch (error) { failed = true; throw error; }
    finally { try { handle.close(); } catch (error) { if (!failed) throw error; } }
}
