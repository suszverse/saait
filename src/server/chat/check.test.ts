import { describe, expect, it } from "vitest";
import { check, checkWithIntent, REASONS, type IntentClassifier } from "./check";

const heldWith = (body: string, context: string[] = []) => {
  const r = check(body, context);
  expect(r.ok).toBe(false);
  return r as Extract<ReturnType<typeof check>, { ok: false }>;
};

describe("check: phone numbers", () => {
  it("holds Devanagari digits", () => {
    const r = heldWith("९८४१२३४५६७");
    expect(r.layer).toBe(2);
    expect(r.reason).toBe(REASONS.phone);
    expect(r.match).toBe("9841234567");
  });

  it("holds English number words", () => {
    expect(heldWith("nine eight four one two three four five six seven").reason).toBe(REASONS.phone);
  });

  it("holds romanised Nepali number words", () => {
    expect(heldWith("nau aath chaar ek dui tin chaar panch chha saat").reason).toBe(REASONS.phone);
  });

  it("holds +977 with a landline", () => {
    const r = heldWith("call +977 1 4000000");
    expect(r.reason).toBe(REASONS.phone);
    expect(r.match).toBe("+977");
  });

  it("holds a landline with area code", () => {
    expect(heldWith("office 01-4000000").match).toBe("014000000");
    expect(heldWith("071 520000").match).toBe("071520000");
  });

  it("holds a 13-digit run with country code", () => {
    expect(heldWith("9779841234567").match).toBe("9779841234567");
  });

  it("does not let an amount prefix exempt a mobile-shaped run", () => {
    const r = heldWith("Rs 9841234567");
    expect(r.reason).toBe(REASONS.phone);
    expect(r.match).toBe("9841234567");
  });

  it("joins digit groups when the message dictates a number", () => {
    const r = heldWith("number is nine eight four one, then 234567");
    expect(r.reason).toBe(REASONS.phone);
    expect(r.match).toBe("9841234567");
    expect(heldWith("फोन 9841 234 567").reason).toBe(REASONS.phone);
    expect(check("9841 and then 234567 later")).toEqual({ ok: true });
  });

  it("folds a number word glued to digits", () => {
    expect(heldWith("98four1234567").match).toBe("9841234567");
  });
});

describe("check: payment details", () => {
  it("holds an eSewa ID", () => {
    const r = heldWith("send to my esewa 9841234567");
    expect(r.reason).toBe(REASONS.payment);
    expect(r.match).toBe("esewa");
  });

  it("holds a bank account number", () => {
    const r = heldWith("my a/c is 01234567890123");
    expect(r.reason).toBe(REASONS.payment);
  });

  it("holds a 14 to 16 digit run with no words", () => {
    expect(heldWith("0123456789012345").reason).toBe(REASONS.payment);
  });

  it("delivers a payment word with no number", () => {
    expect(check("can I pay the deposit with esewa?")).toEqual({ ok: true });
  });

  it("holds short bank words and 12-digit account runs", () => {
    const r = heldWith("bank acc 0123456789012");
    expect(r.reason).toBe(REASONS.payment);
    expect(r.match).toBe("acc");
    expect(heldWith("acct 012345678901").reason).toBe(REASONS.payment);
    expect(heldWith("account no 012345678901").reason).toBe(REASONS.payment);
    expect(heldWith("a/c no 012345678901").reason).toBe(REASONS.payment);
    expect(heldWith("012345678901").reason).toBe(REASONS.payment);
  });
});

describe("check: links, handles and apps", () => {
  it("holds an email", () => {
    const r = heldWith("abc@gmail.com");
    expect(r.reason).toBe(REASONS.link);
    expect(r.match).toBe("abc@gmail.com");
  });

  it("holds an app name with a handle", () => {
    const r = heldWith("ping me on insta @x");
    expect(r.reason).toBe(REASONS.link);
  });

  it("holds a handle on its own", () => {
    expect(heldWith("find me @suraj_photo").match).toBe("@suraj_photo");
  });

  it("holds URLs and shorteners", () => {
    expect(heldWith("https://example.com/p").reason).toBe(REASONS.link);
    expect(heldWith("www.example.np").reason).toBe(REASONS.link);
    expect(heldWith("bit.ly/abc").match).toBe("bit.ly");
    expect(heldWith("wa.me/9841").match).toBe("wa.me");
  });

  it("holds app names as whole words only", () => {
    expect(heldWith("message me on WhatsApp").match).toBe("whatsapp");
    expect(heldWith("just dm me").match).toBe("dm me");
    expect(check("the fbx file is ready")).toEqual({ ok: true });
  });

  it("holds app names split by spaces or apostrophes", () => {
    expect(heldWith("Whats App me").match).toBe("whatsapp");
    expect(heldWith("what's app").match).toBe("whatsapp");
    expect(heldWith("whatsap").match).toBe("whatsap");
    expect(heldWith("insta gram ma").match).toBe("instagram");
    expect(heldWith("face book").match).toBe("facebook");
    expect(heldWith("tele gram").match).toBe("telegram");
    expect(heldWith("tik tok").match).toBe("tiktok");
  });

  it("holds ig only when a handle-like token follows", () => {
    expect(heldWith("IG: ram_photo").reason).toBe(REASONS.link);
    expect(heldWith("ig ram_photo").reason).toBe(REASONS.link);
    expect(check("ig")).toEqual({ ok: true });
  });

  it("holds more shorteners", () => {
    for (const host of ["tiny.cc", "cutt.ly", "rb.gy", "is.gd", "short.io"]) {
      expect(heldWith(`${host}/abc`).match).toBe(host);
    }
  });

  it("holds email intent without an @", () => {
    expect(heldWith("ram dot shrestha at gmail dot com").reason).toBe(REASONS.link);
    expect(heldWith("gmail ma pathau ram.shrestha").match).toBe("gmail");
    expect(heldWith("send it to my yahoo").match).toBe("yahoo");
    expect(heldWith("my mail id is ram").match).toBe("mail id");
    expect(heldWith("ram at example dot com").reason).toBe(REASONS.link);
  });

  it("holds signal and imo only with a contact cue", () => {
    expect(heldWith("message me on signal").reason).toBe(REASONS.link);
    expect(heldWith("signal app ma").reason).toBe(REASONS.link);
    expect(heldWith("text me via signal").reason).toBe(REASONS.link);
    expect(heldWith("imo ma").reason).toBe(REASONS.link);
    expect(heldWith("imo call garum").reason).toBe(REASONS.link);
    expect(heldWith("ping me on imo").reason).toBe(REASONS.link);
    expect(heldWith("call me through imo tonight").reason).toBe(REASONS.link);
  });
});

describe("check: thread context", () => {
  it("holds a number split across messages", () => {
    const r = heldWith("67", ["98 41", "23 45"]);
    expect(r.layer).toBe(3);
    expect(r.reason).toBe(REASONS.phone);
    expect(r.match).toBe("9841234567");
  });

  it("only looks at the last five messages", () => {
    expect(check("67", ["98 41", "a", "b", "c", "d", "23 45"])).toEqual({ ok: true });
  });

  it("delivers an innocent reply after digits in context", () => {
    expect(check("sounds good", ["98 41", "23 45"])).toEqual({ ok: true });
  });
});

describe("check: ordinary booking talk is delivered", () => {
  it.each([
    "500 photos, 10 hours, Falgun 12",
    "Falgun 12 2083 500 photos",
    "the date is 2083-11-12",
    "Rs 1,20,000 for 10 hours",
    "we can do 2 shooters for 12 hours",
    "Hotel Avenue, Traffic Chowk, Butwal",
    "wedding on 05-11-2083",
    "2026-03-14 is free",
    "Poor signal at the venue",
    "Signal Chowk",
    "Hotel Imo",
    "imo 10 hours is enough",
  ])("delivers %s", (body) => {
    expect(check(body)).toEqual({ ok: true });
  });
});

describe("checkWithIntent", () => {
  const always = (n: number): IntentClassifier => ({ score: async () => n });

  it("returns the rule result without calling the classifier", async () => {
    let called = false;
    const spy: IntentClassifier = { score: async () => ((called = true), 1) };
    const r = await checkWithIntent("९८४१२३४५६७", [], spy);
    expect(r).toMatchObject({ ok: false, layer: 2 });
    expect(called).toBe(false);
  });

  it("holds at layer 4 when the score meets the threshold", async () => {
    const r = await checkWithIntent("my number is in my bio", [], always(0.9));
    expect(r).toEqual({ ok: false, layer: 4, reason: REASONS.intent });
  });

  it("delivers below the threshold and with the default classifier", async () => {
    expect(await checkWithIntent("my number is in my bio", [], always(0.5))).toEqual({ ok: true });
    expect(await checkWithIntent("my number is in my bio")).toEqual({ ok: true });
  });

  it("falls through to the rules result when the classifier throws", async () => {
    const broken: IntentClassifier = {
      score: async () => {
        throw new Error("model down");
      },
    };
    expect(await checkWithIntent("my number is in my bio", [], broken)).toEqual({ ok: true });
  });
});
