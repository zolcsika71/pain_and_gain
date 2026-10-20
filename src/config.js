// Scout allocation and scout holding remain disabled after their screening runs.
export const oneScoutFlagExperiment = false;
export const oneHealerEscortExperiment = true;
export const scoutHoldExperiment = false;
export const squadPairExperiment = false;
export const secondaryObjectiveExperiment = false;
export const healerUsefulClosingExperiment = false;
export const supportLockedEngagementExperiment = false;
export const openingDeploymentExperiment = false;
// One actor-level request comparison only; never supplies gameplay routes.
export const openingRouteProbeExperiment = false;
// Separate gameplay authority; requires opening deployment AND the probe.
export const openingRouteAdoptionExperiment = false;
// Route-backed joint proposals; incompatible with probe/adoption authority.
export const openingJointProposalsExperiment = false;
