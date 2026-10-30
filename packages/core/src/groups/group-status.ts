export type MapStatus = 'listed' | 'inactive' | 'unlisted' | 'removed' | 'not_applicable';
export type RetrievalStatus =
  | 'pending'
  | 'active'
  | 'stopped_inactive'
  | 'stopped_unknown'
  | 'retired';

export interface GroupLifecycle {
  readonly mapStatus: MapStatus;
  readonly retrievalStatus: RetrievalStatus;
}

export type GroupTransition =
  | { readonly type: 'directory'; readonly isActive: boolean }
  | { readonly type: 'directory-absent' }
  | { readonly type: 'discovered' }
  | { readonly type: 'unknown-group' }
  | { readonly type: 'promoted' };

export const NEW_DISCOVERED_GROUP: GroupLifecycle = {
  mapStatus: 'unlisted',
  retrievalStatus: 'pending',
};

/**
 * Applies one lifecycle event to a group. The map status answers "what the
 * directory says" and the retrieval status answers "may the scheduler fetch it";
 * keeping them separate is what lets an unlisted group be retrieved while an
 * explicitly inactive one is not.
 */
export function nextGroupStatus(
  current: GroupLifecycle,
  transition: GroupTransition,
): GroupLifecycle {
  // An event scope holds no map status, so no group transition may ever move it.
  if (current.mapStatus === 'not_applicable') return current;

  switch (transition.type) {
    case 'directory':
      return transition.isActive
        ? { mapStatus: 'listed', retrievalStatus: 'active' }
        : { mapStatus: 'inactive', retrievalStatus: 'stopped_inactive' };
    case 'directory-absent':
      return {
        mapStatus: current.mapStatus === 'unlisted' ? 'unlisted' : 'removed',
        retrievalStatus: current.retrievalStatus,
      };
    case 'discovered':
      return {
        mapStatus: current.mapStatus,
        retrievalStatus:
          current.retrievalStatus === 'stopped_unknown' ? 'active' : current.retrievalStatus,
      };
    case 'unknown-group':
      return { mapStatus: current.mapStatus, retrievalStatus: 'stopped_unknown' };
    case 'promoted':
      return {
        mapStatus: current.mapStatus,
        retrievalStatus: current.retrievalStatus === 'pending' ? 'active' : current.retrievalStatus,
      };
  }
}
