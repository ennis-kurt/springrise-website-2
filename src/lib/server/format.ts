const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** 475000 → "$4,750.00" */
export const money = (cents: number | null | undefined) => (cents == null ? "" : usd.format(cents / 100));

/** 475000 → "4750.00" (for inputs and CSV) */
export const dollars = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2));

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const siteUrl = (raw: string | undefined, fallback = "https://springrise.org") =>
  (raw || fallback).replace(/\/+$/, "");
