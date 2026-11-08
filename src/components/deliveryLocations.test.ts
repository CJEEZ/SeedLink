import { describe, expect, test } from 'vitest';
import { municipalities } from '../data/municipalities';
import { findDepotCoordinate, findDestinationCoordinate } from './deliveryLocations';

describe('delivery map destinations', () => {
  test.each(municipalities)('has a map coordinate for %s', (municipality) => {
    expect(findDestinationCoordinate(municipality)).not.toBeNull();
  });

  test('matches full municipality names instead of partial text', () => {
    expect(findDestinationCoordinate('Bulalacao')).toEqual([12.3261931, 121.3437406]);
    expect(findDestinationCoordinate('Bongabong')).toEqual([12.7480016, 121.4892292]);
    expect(findDestinationCoordinate('Calapan City')).toEqual([13.4145513, 121.179543]);
    expect(findDestinationCoordinate('Calapan')).toEqual([13.4145513, 121.179543]);
    expect(findDestinationCoordinate('Naujan district')).toBeNull();
  });

  test('resolves a depot name to its containing municipality', () => {
    expect(findDepotCoordinate('Calapan Seed Hub')).toEqual([13.4145513, 121.179543]);
    expect(findDepotCoordinate('Naujan Depot')).toEqual([13.324239, 121.3030659]);
    expect(findDepotCoordinate('Unknown Depot')).toBeNull();
  });
});
