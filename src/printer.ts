import { Capacitor, registerPlugin } from "@capacitor/core";
import type { AppState, Device, PrinterProfile, Receipt, PrintJob } from "./model";
interface PrinterApi {
  getState(): Promise<AppState>;
  getJob(options: { id: string }): Promise<PrintJob>;
  saveProfile(options: { profile: PrinterProfile }): Promise<void>;
  deleteProfile(options: { id: string }): Promise<void>;
  enqueue(options: {
    id: string;
    profile: PrinterProfile;
    receipt: Receipt;
  }): Promise<{ id: string }>;
  retry(options: { id: string }): Promise<void>;
  cancel(options: { id: string }): Promise<void>;
  resume(): Promise<void>;
  listBluetooth(): Promise<{ devices: Device[] }>;
  bluetoothSettings(): Promise<void>;
  listUsb(): Promise<{ devices: Device[] }>;
  requestUsb(options: { address: string }): Promise<void>;
}
export const isAndroid = Capacitor.getPlatform() === "android";
const native = registerPlugin<PrinterApi>("Printer");
const unavailable = async (): Promise<never> => {
  throw new Error(
    "Printing requires the Anyprint Android app. This browser preview does not connect to printers.",
  );
};
// Browser previews never simulate successful printing or silently discard a print job.
export const printer: PrinterApi = isAndroid
  ? native
  : {
      getState: async () => ({ profiles: [], jobs: [] }),
      getJob: unavailable,
  saveProfile: unavailable,
      deleteProfile: unavailable,
      enqueue: unavailable,
      retry: unavailable,
      cancel: unavailable,
      resume: unavailable,
      listBluetooth: unavailable,
      bluetoothSettings: unavailable,
      listUsb: unavailable,
      requestUsb: unavailable,
    };
