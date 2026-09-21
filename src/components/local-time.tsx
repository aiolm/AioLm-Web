"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import { intlLocales } from "@/i18n/config";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** Show a stable UTC fallback during hydration, then the browser's local time. */
export function LocalTime({ value }: { value: string }) {
  const { locale } = useI18n();
  const isClient = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>—</span>;

  const iso = date.toISOString();
  const utc = `${iso.replace("T", " ").replace("Z", "")} UTC`;
  const label = isClient
    ? new Intl.DateTimeFormat(intlLocales[locale], {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hourCycle: "h23", timeZoneName: "shortOffset",
      }).format(date)
    : utc;

  return <time dateTime={iso} title={utc}>{label}</time>;
}
