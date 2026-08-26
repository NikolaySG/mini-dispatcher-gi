"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";

const SARATOV_TIME_ZONE = "Europe/Saratov";

type ClockParts = {
  day: string;
  month: string;
  weekday: string;
  hour: number;
  minute: number;
  second: number;
};

export function AnalogCalendarClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const parts = useMemo(() => now ? getClockParts(now) : null, [now]);
  const clockStyle = parts ? {
    "--hour-angle": `${(parts.hour % 12) * 30 + parts.minute * .5}deg`,
    "--minute-angle": `${parts.minute * 6 + parts.second * .1}deg`,
    "--second-angle": `${parts.second * 6}deg`,
  } as CSSProperties : undefined;

  return (
    <div className="status-clock-cell">
      <span className="status-clock-label">Дата и время</span>
      <div
        className={parts ? "time-instrument" : "time-instrument is-loading"}
        aria-label={parts ? `${parts.day} ${parts.month}, ${parts.weekday}; саратовское время` : "Синхронизация часов"}
      >
        <div className="analog-clock" style={clockStyle} aria-hidden="true">
          <i className="clock-hand clock-hour" />
          <i className="clock-hand clock-minute" />
          <i className="clock-hand clock-second" />
          <i className="clock-pin" />
        </div>
        <div className="flip-calendar" aria-hidden="true">
          <div className="calendar-rings"><i /><i /></div>
          <div className="calendar-sheet" key={parts ? `${parts.day}-${parts.month}` : "loading"}>
            <b>{parts?.day ?? "--"}</b>
            <span><strong>{parts?.month ?? "ЗАГРУЗКА"}</strong><small>{parts?.weekday ?? "ВРЕМЕНИ"}</small></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getClockParts(date: Date): ClockParts {
  const numericParts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: SARATOV_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    numericParts.find((part) => part.type === type)?.value ?? "0";
  const dateParts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: SARATOV_TIME_ZONE,
    day: "2-digit",
    month: "short",
    weekday: "short",
  }).formatToParts(date);
  const dateValue = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((part) => part.type === type)?.value ?? "";

  return {
    day: dateValue("day"),
    month: dateValue("month").replace(".", "").toUpperCase(),
    weekday: dateValue("weekday").replace(".", "").toUpperCase(),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
  };
}
