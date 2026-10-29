import { describe, expect, it } from 'vitest';

import { NEW_DISCOVERED_GROUP, nextGroupStatus, type GroupLifecycle } from './group-status.js';

const listedActive: GroupLifecycle = { mapStatus: 'listed', retrievalStatus: 'active' };
const inactive: GroupLifecycle = { mapStatus: 'inactive', retrievalStatus: 'stopped_inactive' };
const unlistedPending: GroupLifecycle = { mapStatus: 'unlisted', retrievalStatus: 'pending' };
const unlistedActive: GroupLifecycle = { mapStatus: 'unlisted', retrievalStatus: 'active' };
const stoppedUnknown: GroupLifecycle = { mapStatus: 'unlisted', retrievalStatus: 'stopped_unknown' };
const removed: GroupLifecycle = { mapStatus: 'removed', retrievalStatus: 'active' };

describe('group lifecycle transitions', () => {
  it('starts a discovered group pending and unlisted', () => {
    expect(NEW_DISCOVERED_GROUP).toEqual({ mapStatus: 'unlisted', retrievalStatus: 'pending' });
  });

  it('lets the directory list, deactivate and re-activate a group', () => {
    expect(nextGroupStatus(unlistedPending, { type: 'directory', isActive: true })).toEqual(
      listedActive,
    );
    expect(nextGroupStatus(listedActive, { type: 'directory', isActive: false })).toEqual(inactive);
    expect(nextGroupStatus(inactive, { type: 'directory', isActive: true })).toEqual(listedActive);
    expect(nextGroupStatus(stoppedUnknown, { type: 'directory', isActive: true })).toEqual(
      listedActive,
    );
  });

  it('marks an absent group removed without touching its retrieval', () => {
    expect(nextGroupStatus(listedActive, { type: 'directory-absent' })).toEqual({
      mapStatus: 'removed',
      retrievalStatus: 'active',
    });
    expect(nextGroupStatus(inactive, { type: 'directory-absent' })).toEqual({
      mapStatus: 'removed',
      retrievalStatus: 'stopped_inactive',
    });
    expect(nextGroupStatus(unlistedActive, { type: 'directory-absent' })).toEqual(unlistedActive);
  });

  it('promotes only pending groups', () => {
    expect(nextGroupStatus(unlistedPending, { type: 'promoted' })).toEqual(unlistedActive);
    expect(nextGroupStatus(listedActive, { type: 'promoted' })).toEqual(listedActive);
  });

  it('re-enables a stopped-unknown group when a payload names it again', () => {
    expect(nextGroupStatus(stoppedUnknown, { type: 'discovered' })).toEqual(unlistedActive);
  });

  it('never resurrects a group the directory marked inactive', () => {
    expect(nextGroupStatus(inactive, { type: 'discovered' })).toEqual(inactive);
  });

  it('keeps a removed group removed when a payload names it', () => {
    expect(nextGroupStatus(removed, { type: 'discovered' })).toEqual(removed);
  });

  it('stops scheduling on an unknown-group answer without changing the map status', () => {
    expect(nextGroupStatus(listedActive, { type: 'unknown-group' })).toEqual({
      mapStatus: 'listed',
      retrievalStatus: 'stopped_unknown',
    });
  });
});
