export type Connection = "bluetooth" | "usb" | "network";
export type PrinterProfile = {
  id: string;
  name: string;
  connection: Connection;
  address: string;
  port: number;
  paperMm: number;
  dots: number;
  imageMode: "raster" | "column";
  textMode?: "native" | "image";
  logoMode?: "solid" | "photo";
  textWeight?: "normal" | "bold";
  paceMs: number;
  cut: boolean;
  vendorId?: number;
  productId?: number;
};
export type ReceiptItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};
export type Receipt = {
  title: string;
  subtitle: string;
  reference: string;
  date: string;
  currency: string;
  items: ReceiptItem[];
  footer: string;
  qr: string;
  logo: string;
  isCopy?: boolean;
  qualityCheck?: boolean;
};
export type JobState =
  | "queued"
  | "connecting"
  | "sending"
  | "sent"
  | "failed"
  | "unknown"
  | "cancelled";
export type PrintJob = {
  id: string;
  receipt: Receipt;
  profile: PrinterProfile;
  state: JobState;
  created: number;
  message: string;
};
export type Device = {
  name: string;
  address: string;
  vendorId?: number;
  productId?: number;
  supported?: boolean;
  permission?: boolean;
};
export type AppState = { profiles: PrinterProfile[]; jobs: PrintJob[] };
export const uid = () => crypto.randomUUID();
export const newProfile = (): PrinterProfile => ({
  id: uid(),
  name: "",
  connection: "bluetooth",
  address: "",
  port: 9100,
  paperMm: 58,
  dots: 384,
  imageMode: "raster",
  textMode: "native",
  textWeight: "bold",
  logoMode: "solid",
  paceMs: 10,
  cut: false,
});
export const newReceipt = (): Receipt => ({
  title: "",
  subtitle: "",
  reference: "",
  date: "",
  currency: "IDR",
  items: [{ id: uid(), name: "", quantity: 1, price: 0 }],
  footer: "Thank you for your purchase!",
  qr: "",
  logo: "",
});
export const currencyDigits = (currency: string) =>
  currency === "IDR" ? 0 : 2;
export const unitMinor = (price: number, currency: string) =>
  Math.round((price + Number.EPSILON) * 10 ** currencyDigits(currency));
export const total = (receipt: Receipt) =>
  receipt.items.reduce(
    (sum, item) =>
      sum + unitMinor(item.price, receipt.currency) * item.quantity,
    0,
  ) /
  10 ** currencyDigits(receipt.currency);
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(currency === "IDR" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currencyDigits(currency),
    minimumFractionDigits: currencyDigits(currency),
  }).format(amount);
export function validateReceipt(r: Receipt): string | null {
  if (!r.title.trim() || r.title.length > 80)
    return "Add a store name, up to 80 characters.";
  if (!r.items.length || r.items.length > 40)
    return "Add between 1 and 40 items.";
  if (r.items.some((i) => !i.name.trim() || i.name.length > 120))
    return "Give every item a name, up to 120 characters.";
  if (
    r.items.some(
      (i) =>
        !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 999,
    )
  )
    return "Quantities must be whole numbers from 1 to 999.";
  if (
    r.items.some(
      (i) => !Number.isFinite(i.price) || i.price < 0 || i.price > 100_000_000,
    )
  )
    return "Prices must be between 0 and 100,000,000.";
  if (r.qr.length > 300) return "QR content must be 300 characters or less.";
  if (r.subtitle.length > 200 || r.footer.length > 500)
    return "Shorten the receipt subtitle or footer.";
  if (r.reference.length > 80)
    return "Receipt number must be 80 characters or less.";
  return null;
}
export function validateProfile(p: PrinterProfile): string | null {
  if (!p.name.trim() || p.name.length > 80) return "Give your printer a name.";
  if (!p.address)
    return p.connection === "network"
      ? "Enter the printer IP address."
      : "Select a printer from the device list.";
  if (
    p.connection === "network" &&
    (!/^[A-Za-z0-9.:_-]{1,253}$/.test(p.address) ||
      !Number.isInteger(p.port) ||
      p.port < 1 ||
      p.port > 65535)
  )
    return "Use an IP address or hostname and a port from 1 to 65535.";
  if (
    !Number.isInteger(p.dots) ||
    p.dots < 192 ||
    p.dots > 832 ||
    p.dots % 8 !== 0
  )
    return "Printable width must be 192–832 dots, in multiples of 8.";
  if (!Number.isInteger(p.paperMm) || p.paperMm < 58 || p.paperMm > 112)
    return "Paper width must be 58–112 mm.";
  if (!["native", "image"].includes(p.textMode ?? "native")) return "Choose a supported text mode.";
  if (!["solid", "photo"].includes(p.logoMode ?? "solid")) return "Choose a supported logo mode.";
  if (!["normal", "bold"].includes(p.textWeight ?? "bold")) return "Choose a supported print weight.";
  return null;
}
export const stateLabels: Record<JobState, string> = {
  queued: "Queued",
  connecting: "Connecting",
  sending: "Sending",
  sent: "Sent to printer",
  failed: "Not sent",
  unknown: "Check the paper",
  cancelled: "Cancelled",
};
/** Conservative alternate image path, not a firmware-specific heat/density command. */
export function vsc58Profile(profile: PrinterProfile): PrinterProfile {
  return { ...profile, paperMm: 58, dots: 384, textMode: "image", textWeight: "bold",
    imageMode: "column", logoMode: "solid", paceMs: 30, cut: false };
}
export function diagnostic(profile: PrinterProfile): Receipt {
  return {
    title: "Anyprint / short test", subtitle: "Normal, bold, image A / B",
    qualityCheck: true, reference: `${profile.paperMm} mm / ${profile.dots} dots`,
    date: "", currency: "IDR",
    items: [{ id: uid(), name: "Calibration only", quantity: 1, price: 0 }],
    footer: "", qr: "", logo: "",
  };
}
