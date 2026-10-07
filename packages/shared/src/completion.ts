import type { Property } from './types';

/**
 * Property profile completion (M2): "62% complete" plus the next
 * meaningful actions. Lives in the shared package so the API (which
 * computes it) and the app (which renders it) can never disagree.
 */

export type CompletionKey =
  | 'basics'
  | 'address'
  | 'location'
  | 'area'
  | 'identifiers'
  | 'photo'
  | 'sale_deed'
  | 'property_tax';

export interface CompletionItem {
  key: CompletionKey;
  label: string;
  done: boolean;
}

export interface PropertyCompletion {
  percent: number;
  items: CompletionItem[];
  /** Incomplete items in suggested order — the "next actions". */
  next: CompletionItem[];
}

export interface CompletionInput {
  property: Pick<
    Property,
    | 'name'
    | 'property_type'
    | 'address_line'
    | 'city'
    | 'state'
    | 'pincode'
    | 'latitude'
    | 'location_source'
    | 'area_value'
    | 'survey_number'
    | 'property_number'
    | 'khata_number'
  >;
  photoCount: number;
  documentTypes: readonly string[];
}

export function computePropertyCompletion({
  property: p,
  photoCount,
  documentTypes,
}: CompletionInput): PropertyCompletion {
  const items: CompletionItem[] = [
    { key: 'basics', label: 'Name and property type', done: !!p.name && !!p.property_type },
    {
      key: 'address',
      label: 'Address, city, state and PIN',
      done: !!(p.address_line && p.city && p.state && p.pincode),
    },
    {
      key: 'location',
      label: 'Confirm the location on the map',
      done: p.latitude !== null && p.location_source === 'user',
    },
    { key: 'sale_deed', label: 'Upload the Sale Deed', done: documentTypes.includes('sale_deed') },
    { key: 'photo', label: 'Add a photo of the property', done: photoCount > 0 },
    { key: 'area', label: 'Add the plot / land area', done: p.area_value !== null },
    {
      key: 'identifiers',
      label: 'Add a survey, plot or Khata number',
      done: !!(p.survey_number || p.property_number || p.khata_number),
    },
    {
      key: 'property_tax',
      label: 'Upload a property tax receipt',
      done: documentTypes.includes('property_tax'),
    },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    percent: Math.round((done / items.length) * 100),
    items,
    next: items.filter((i) => !i.done),
  };
}
