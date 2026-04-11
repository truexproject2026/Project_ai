import venuesData from "@/data/venues.json";

export type Venue = {
  id: string;
  name: string;
  area: string;
  tagline: string;
  personality: string;
  tone: string;
  keywords: string[];
};

const venues = venuesData as Venue[];

/**
 * ถ้า dataset มี metadata ร้านจริง จะใช้ field นั้น.
 * ถ้าไม่มี metadata แต่มี review text, จะแมปตาม keyword ที่ตรงกับประเภทร้าน.
 * ถ้าไม่มีข้อมูลอื่นเลย จะ fallback เป็น index mod 3.
 */
export const VENUE_TRAIN_ORDER = ["common-room", "hom-duan", "tid-din"] as const;

export function trainSlotForVenue(venueId: string): number {
  const i = (VENUE_TRAIN_ORDER as readonly string[]).indexOf(venueId);
  return i >= 0 ? i : 0;
}

export function rowIndexMatchesVenue(rowIndex: number, venueId: string): boolean {
  return rowIndex % VENUE_TRAIN_ORDER.length === trainSlotForVenue(venueId);
}

type DatasetRow = {
  review_body?: string;
  restaurant_id?: string;
  restaurant_name?: string;
};

export function rowMatchesVenue(
  row: DatasetRow | undefined,
  venue: Venue,
  rowIndex: number
): boolean {
  if (!row) return false;

  if (row.restaurant_id) {
    return row.restaurant_id === venue.id;
  }

  if (row.restaurant_name) {
    const normalizedName = compactForMatch(row.restaurant_name);
    if (compactForMatch(venue.name) === normalizedName) {
      return true;
    }
    return venue.keywords.some((keyword) => compactForMatch(keyword) === normalizedName);
  }

  if (row.review_body) {
    return reviewMatchesVenue(row.review_body, venue);
  }

  return rowIndexMatchesVenue(rowIndex, venue.id);
}

export function listVenues(): Venue[] {
  return venues;
}

export function getVenueById(id: string): Venue | undefined {
  return venues.find((v) => v.id === id);
}

/** Collapse spaces / zero-width for substring match (Thai reviews rarely include exact spacing). */
export function compactForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\s\u200b-\u200d\ufeff]+/g, "");
}

export function reviewMatchesVenue(text: string, venue: Venue): boolean {
  const c = compactForMatch(text);
  return venue.keywords.some((k) => c.includes(compactForMatch(k)));
}
