/** Kushtia circle grid stations */
const CIRCLE_STATIONS = [
  {
    id: "bottail",
    name: "Bottail (Kushtia)",
    source: "calculator",
    note: "Filled from Calculator / Manual hourly saves",
  },
  { id: "jhinaidah", name: "Jhinaidah", source: "manual" },
  { id: "kaligonj", name: "Kaligonj", source: "manual" },
  { id: "bheramara", name: "Bheramara", source: "manual" },
  { id: "chuadanga", name: "Chuadanga", source: "manual" },
];

const SPECIAL_SLOTS = new Set(["18:30", "19:30"]);

function windowMinutes(slotLabel) {
  return SPECIAL_SLOTS.has(String(slotLabel)) ? 15 : 20;
}

function isSlotEditable(dayKey, hourSlot, now = new Date()) {
  const m = String(hourSlot || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const win = windowMinutes(hourSlot);
  const OFFSET_MS = 6 * 60 * 60 * 1000;
  const [Y, M, D] = String(dayKey).split("-").map(Number);
  const utcMs = Date.UTC(Y, M - 1, D, hh, mm, 0, 0) - OFFSET_MS;
  const slotAt = new Date(utcMs);
  const diffMin = Math.abs(now.getTime() - slotAt.getTime()) / 60000;
  return diffMin <= win + 0.05;
}

function dayKeyDhaka(d = new Date()) {
  const OFFSET_MS = 6 * 60 * 60 * 1000;
  const shifted = new Date(d.getTime() + OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

module.exports = {
  CIRCLE_STATIONS,
  SPECIAL_SLOTS,
  windowMinutes,
  isSlotEditable,
  dayKeyDhaka,
};
