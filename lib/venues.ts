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

/** ลำดับร้านตรงกับช่องใน split train: แถวที่ index % 3 === slot จะแสดงในร้านนั้น (ข้อมูลจริงจาก HF ไม่มีคอลัมน์ชื่อร้าน) */
export const VENUE_TRAIN_ORDER = ["common-room", "hom-duan", "tid-din"] as const;

export function trainSlotForVenue(venueId: string): number {
  const i = (VENUE_TRAIN_ORDER as readonly string[]).indexOf(venueId);
  return i >= 0 ? i : 0;
}

export function rowIndexMatchesVenue(rowIndex: number, venueId: string): boolean {
  return rowIndex % VENUE_TRAIN_ORDER.length === trainSlotForVenue(venueId);
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
