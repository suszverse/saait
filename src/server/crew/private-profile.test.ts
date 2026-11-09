import { describe, expect, it } from "vitest";
import { checkPrivateProfile } from "./private-profile";

const bio = (text: string) => checkPrivateProfile({ bio: text });
const rejects = (text: string, reason: RegExp) => {
  const r = bio(text);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.field).toBe("bio");
    expect(r.reason).toMatch(reason);
  }
};

describe("checkPrivateProfile", () => {
  it("passes a clean profile", () => {
    expect(checkPrivateProfile({ headline: "Second shooter for weddings, five years, Sony A7 IV, candid and low light" })).toEqual({ ok: true });
    expect(checkPrivateProfile({ headline: "Based in Butwal", bio: "Available Falgun and Chaitra 2083.", roles: ["second-shooter", "drone"] })).toEqual({ ok: true });
    expect(checkPrivateProfile({})).toEqual({ ok: true });
  });

  it("rejects phone numbers in every disguise", () => {
    rejects("Call 9841234567 for rates", /phone numbers/);
    rejects("Viber 98-41-23-45-67", /phone numbers/);
    rejects("Office 01-4412345", /phone numbers/);
    rejects("Landline 071-520123", /phone numbers/);
    rejects("+977 9841234567", /phone numbers/);
    rejects("WhatsApp ९८४१२३४५६७", /phone numbers/);
    rejects("nine eight four one two three four five six seven", /phone numbers/);
    rejects("ref 12345678", /phone numbers/);
  });

  it("rejects emails, links and handles", () => {
    rejects("mail me at ram.photo@gmail.com", /email/);
    rejects("see https://rambahadur.com", /links/);
    rejects("portfolio www.ramphoto.np", /links/);
    rejects("ramphoto.com.np has my work", /links/);
    rejects("insta @ram_shoots", /handles/);
  });

  it("rejects studio-like business words as whole words", () => {
    rejects("I run Ram Studio in Butwal", /studio or company/);
    rejects("Himal Films second unit", /studio or company/);
    rejects("Sunrise Photography", /studio or company/);
    rejects("Lumbini Production House", /studio or company/);
    rejects("Ram Pvt. Ltd.", /studio or company/);
    rejects("Butwal Wedding Co", /studio or company/);
    // Ordinary words that contain a business word are fine.
    expect(bio("Studious about light; I filmed a documentary").ok).toBe(true);
  });

  it("rejects place detail finer than a city", () => {
    rejects("Butwal ward 5", /city/);
    rejects("बुटवल वडा ५", /city/);
    rejects("near Traffic Chowk", /city/);
    rejects("Milan Tole, Butwal", /city/);
    rejects("Siddhartha Marg", /city/);
    rejects("behind Ram Galli", /city/);
    rejects("Hospital Road", /city/);
    rejects("Main Street", /city/);
    rejects("House no 12, Butwal", /city/);
    expect(bio("Based in Butwal, travel across Rupandehi").ok).toBe(true);
    expect(bio("Home city Butwal since 2015").ok).toBe(true);
  });

  it("names the field that failed, checking each role on its own", () => {
    expect(checkPrivateProfile({ headline: "Call 9841234567" })).toMatchObject({ ok: false, field: "headline" });
    expect(checkPrivateProfile({ headline: "Fine", bio: "ram@x.com" })).toMatchObject({ ok: false, field: "bio" });
    expect(checkPrivateProfile({ roles: ["drone", "Ram Studio editor"] })).toMatchObject({ ok: false, field: "roles" });
  });
});

import { it as itYear, expect as expectYear } from "vitest";
import { checkPrivateProfile as checkYear } from "./private-profile";

itYear("lets a year range through as experience, not a phone number", () => {
  expectYear(checkYear({ headline: "Weddings since 2019, Canon 70-200, 2019-2024 at a studio in Butwal" }).ok).toBe(false); // "studio" still rejects
  expectYear(checkYear({ bio: "Available 2081-2083. Shooting 2019 to 2024 full time." }).ok).toBe(true);
});
