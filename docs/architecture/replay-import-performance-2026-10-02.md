# Replay-watcher startup measurement (2026-10-02)

The committed watcher-reporting change made startup visible but did not shorten
the initial cache scan. A bounded production observation at commit
`af2648aad7f64d357b6c83228f51acf0aa6b27d1` reached polling readiness in
297 seconds. The default cache held 1,115 files, including 355 parseable replay
log responses: 239 matched current records, 11 were retired, and 105 had no
validated active map. The final 105 `deferred` reports appeared only after the
file loop. There was no new map-backed import candidate. This observation does
not reconstruct when the earlier silent watcher sessions stopped.

## Bounded profile and change

The baseline profile copied the existing 445 MB manifest and the first 60
sorted cache files, plus their referenced maps and captures, to an isolated
root. Of these files, 15 were replay-log responses: nine current, one retired,
and five unassociated. `scanCache` took 12,110 ms. It acquired the manifest lock
15 times, read and parsed the manifest 15 times (2,253 ms reading and 9,595 ms
parsing), read ten maps, and reported five mapless deferrals. Repeated manifest
loading accounted for nearly all measured scan time; this is a measured
bottleneck, not an inference from the 297-second run alone.

The importer now keeps one parsed manifest per `scanCache` call. Every parsed log response
still acquires and releases the same lock. Under that lock, reuse requires the
manifest's device, inode, size, nanosecond modification time, and nanosecond
change time to match the cached stamp. An atomic replacement by another
lock-using writer forces a reload. A failed action invalidates the in-memory
copy. A successful import that writes the manifest changes its stamp, so the
next response reloads. Replay-specific map validation, output verification,
deduplication, retired fingerprints, deferred retry, and review lifecycle
rules are unchanged. No scan-wide lock or cross-poll cache was introduced.

On an equivalent isolated copy of those 60 files, the changed scan took
1,121 ms: 15 lock acquisitions, one manifest read and parse (234 ms and 640 ms),
ten map reads, and the same five deferrals. A separate isolated copy of all
1,115 cache files and their referenced managed evidence completed the changed
scan in 9,160 ms with one manifest read, 250 map reads, 105 deferrals, and the
same 239 retained records. These are local wall-clock samples, not a guarantee
for another cache or a live Arena write. The full-copy result and the earlier
production 297 seconds are not a paired benchmark on identical destinations.
The full-copy `watch` CLI reached its polling-readiness line in 10,100 ms,
including reconciliation and the initial scan, and reported the same 105
deferrals with no import or error.

Startup still announces itself before reconciliation and prints readiness after
the scan. The full-copy scan no longer had a multi-minute silent interval, so
this change adds no periodic duplicate or per-file output. If future caches
make that interval long again, add coarse bounded progress separately from
import events; duplicate responses must remain quiet as evidence events.
