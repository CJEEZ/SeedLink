import { municipalities } from '../data/municipalities';

export type DeliveryCoordinate = [number, number];

const MUNICIPALITY_COORDINATES: Record<string, DeliveryCoordinate> = {
  Baco: [13.3581031, 121.0963319],
  Bansud: [12.8640556, 121.4555057],
  Bongabong: [12.7480016, 121.4892292],
  Bulalacao: [12.3261931, 121.3437406],
  'Calapan City': [13.4145513, 121.179543],
  Gloria: [12.9688453, 121.4785283],
  Mansalay: [12.5204987, 121.4389813],
  Naujan: [13.324239, 121.3030659],
  Pinamalayan: [13.0386691, 121.4801563],
  Pola: [13.1435504, 121.4416056],
  'Puerto Galera': [13.5017104, 120.9543353],
  Roxas: [12.5908562, 121.517018],
  'San Teodoro': [13.4365332, 121.0199119],
  Socorro: [13.0552134, 121.406919],
  Victoria: [13.1733849, 121.2787746],
};

function normalizeLocation(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const exactCoordinates = new Map(
  Object.entries(MUNICIPALITY_COORDINATES).map(([name, coordinate]) => [normalizeLocation(name), coordinate]),
);
const depotLocationNames = [...municipalities, 'Calapan'].sort((first, second) => second.length - first.length);

function canonicalizeMunicipality(value: string) {
  const normalized = normalizeLocation(value).replace(/^(municipality of|city of) /, '');
  if (normalized === 'calapan') return 'calapan city';
  return normalized;
}

export function findDestinationCoordinate(value: string): DeliveryCoordinate | null {
  return exactCoordinates.get(canonicalizeMunicipality(value)) ?? null;
}

export function findDepotCoordinate(value: string): DeliveryCoordinate | null {
  const normalized = normalizeLocation(value);
  const exact = exactCoordinates.get(canonicalizeMunicipality(value));
  if (exact) return exact;

  const municipality = depotLocationNames.find((name) => {
    const normalizedName = normalizeLocation(name);
    return new RegExp(`(^| )${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(normalized);
  });
  return municipality ? exactCoordinates.get(canonicalizeMunicipality(municipality)) ?? null : null;
}
