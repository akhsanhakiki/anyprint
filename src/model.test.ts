import { describe, it, expect } from "vitest";
import {
  newReceipt,
  diagnostic,
  vsc58Profile,
  newProfile,
  total,
  validateReceipt,
  validateProfile,
} from "./model";
describe("receipt safety", () => {
  it("requires intentional receipt content", () =>
    expect(validateReceipt(newReceipt())).toMatch(/store name/));
  it("calculates totals in minor units to avoid floating-point drift", () => {
    const r = {
      ...newReceipt(),
      currency: "USD",
      items: [
        { id: "1", name: "Coffee", price: 0.1, quantity: 3 },
        { id: "2", name: "Milk", price: 0.2, quantity: 1 },
      ],
    };
    expect(total(r)).toBe(0.5);
  });
  it.each([NaN, Infinity, -1, 100000001])(
    "rejects invalid price %s",
    (price) => {
      const r = {
        ...newReceipt(),
        title: "Store",
        items: [{ id: "1", name: "Coffee", price, quantity: 1 }],
      };
      expect(validateReceipt(r)).toMatch(/Prices/);
    },
  );
  it("rejects fractional quantities", () => {
    const r = {
      ...newReceipt(),
      title: "Store",
      items: [{ id: "1", name: "Coffee", price: 100, quantity: 1.5 }],
    };
    expect(validateReceipt(r)).toMatch(/whole numbers/);
  });
});
describe("printer settings", () => {
  const network = () => ({
    ...newProfile(),
    name: "Counter",
    connection: "network" as const,
    address: "192.168.1.100",
  });
  it("accepts a valid network profile", () =>
    expect(validateProfile(network())).toBeNull());
  it("rejects HTTP URLs since transport requires raw TCP", () =>
    expect(
      validateProfile({ ...network(), address: "http://192.168.1.100" }),
    ).toMatch(/IP address/));
  it("requires byte-aligned widths", () =>
    expect(validateProfile({ ...network(), dots: 383 })).toMatch(
      /multiples of 8/,
    ));
  it("rejects out-of-range ports", () =>
    expect(validateProfile({ ...network(), port: 65536 })).toMatch(/65535/));
});

describe("print quality defaults", () => {
  it("defaults new profiles to resident text with a darker weight", () => {
    expect(newProfile()).toMatchObject({ textMode: "native", textWeight: "bold" });
  });
  it("accepts existing 0.1 profiles without resetting printer settings", () => {
    const { textMode, textWeight, ...legacy } = { ...newProfile(), name: "Existing printer", connection: "network" as const, address: "192.168.1.10" };
    expect(textMode).toBe("native"); expect(textWeight).toBe("bold");
    expect(validateProfile(legacy)).toBeNull();
  });
});

describe("compact quality setup", () => {
  it("VSC setup preserves connection identity and selects a conservative image path", () => {
    const old = { ...newProfile(), id: "saved", name: "Counter", address: "AA:BB:CC:DD:EE:FF" };
    expect(vsc58Profile(old)).toMatchObject({ id: old.id, name: old.name, address: old.address,
      paperMm:58, dots:384, textMode:"image", imageMode:"column", logoMode:"solid", paceMs:30, cut:false });
  });
  it("diagnostic has no long footer or QR and remains a valid job", () => {
    const r = diagnostic(newProfile());
    expect(r).toMatchObject({qualityCheck:true, footer:"", qr:"", logo:"", date:""});
    expect(validateReceipt(r)).toBeNull();
  });
});
