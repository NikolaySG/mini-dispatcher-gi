import type { CSSProperties } from "react";
import { calculateKarma, KARMA_RULES, type KarmaIdentity, type KarmaTask } from "../lib/karma";

export function KarmaDashboard({ tasks, now, identities }: { tasks: KarmaTask[]; now: number; identities: KarmaIdentity[] }) {
  const results = calculateKarma(tasks, now, identities);
  const excluded = tasks.filter((task) => task.karmaExcluded).length;
  const average = results.length ? Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length) : 0;
  const leader = results[0];
  const riskCount = results.filter((item) => item.score < 40).length;

  return <section className="karma-stage" aria-labelledby="karma-title">
    <div className="karma-atmosphere" aria-hidden="true">
      <i className="karma-orb orb-a" /><i className="karma-orb orb-b" /><i className="karma-orb orb-c" />
      <span className="karma-scanline" />
    </div>

    <header className="karma-hero">
      <div>
        <p className="signal-label">ДИНАМИКА ИСПОЛНЕНИЯ / LIVE</p>
        <h2 id="karma-title">Карма <em>исполнителей</em></h2>
        <p>Рейтинг учитывает объём поручений, подтверждённое выполнение в срок, просрочки и переносы.</p>
      </div>
      <div className="karma-pulse" aria-label={`Средняя карма ${average} из 100`}>
        <span className="karma-pulse-ring ring-one" /><span className="karma-pulse-ring ring-two" />
        <strong>{average}</strong><small>СРЕДНЯЯ КАРМА</small>
      </div>
    </header>

    <div className="karma-summary">
      <article><span>Лидер контура</span><strong>{leader?.owner ?? "Нет данных"}</strong><small>{leader ? `${leader.score} баллов` : "Пока нечего считать"}</small></article>
      <article><span>Исполнителей</span><strong>{results.length}</strong><small>есть учитываемые поручения</small></article>
      <article><span>Зона риска</span><strong>{riskCount}</strong><small>карма ниже 40</small></article>
      <article><span>Исключено</span><strong>{excluded}</strong><small>поручений вне расчёта</small></article>
    </div>

    <div className="karma-grid">
      <div className="karma-leaderboard">
        <div className="karma-section-head"><div><p className="kicker">РЕЙТИНГ / 0–100</p><h3>Исполнители</h3></div><span>{results.length} позиций</span></div>
        <div className="karma-list">
          {results.map((item, index) => <article className={`karma-person ${karmaBand(item.score)}`} key={item.owner} style={{ "--delay": `${Math.min(index, 12) * 70}ms` } as CSSProperties}>
            <span className="karma-rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="karma-avatar"><i>{initials(item.owner)}</i><span /></div>
            <div className="karma-person-main">
              <strong>{item.owner}</strong>
              <small>{item.total} поруч. · {item.completed} выполн. · {item.transfers} перен.</small>
              <span className="karma-track"><i style={{ width: `${item.score}%` }} /></span>
            </div>
            <div className="karma-score"><strong>{item.score}</strong><small>{karmaLabel(item.score)}</small></div>
            <div className="karma-breakdown">
              <span className="positive">+{item.volumePoints + item.onTimePoints}</span>
              <span className="negative">−{item.latePenalty + item.overduePenalty + item.transferPenalty}</span>
            </div>
          </article>)}
          {!results.length && <div className="karma-empty">Нет поручений, включённых в расчёт кармы.</div>}
        </div>
      </div>

      <aside className="karma-rules">
        <div className="karma-section-head"><div><p className="kicker">МЕТОДИКА</p><h3>Как считается</h3></div><span>ПРОЗРАЧНО</span></div>
        <div className="formula-core"><span>СТАРТ</span><strong>{KARMA_RULES.base}</strong><small>баллов каждому исполнителю</small></div>
        <div className="formula-list">
          <div className="plus"><b>+1</b><span>за каждое поручение</span><small>не более +{KARMA_RULES.volumeCap}</small></div>
          <div className="plus"><b>+{KARMA_RULES.onTimeCompletion}</b><span>выполнено в срок</span><small>по подтверждённой дате</small></div>
          <div className="minus"><b>{KARMA_RULES.lateCompletion}</b><span>выполнено позже срока</span><small>за каждое поручение</small></div>
          <div className="minus"><b>−{Math.abs(KARMA_RULES.overdue)}</b><span>текущая просрочка</span><small>за каждое поручение</small></div>
          <div className="minus"><b>−{Math.abs(KARMA_RULES.transfer)}</b><span>перенос срока</span><small>за каждый перенос</small></div>
        </div>
        <p className="karma-note">Снятые и отмеченные «Не учитывать в карме» поручения исключаются полностью. При нескольких исполнителях поручение учитывается у каждого.</p>
      </aside>
    </div>
  </section>;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function karmaBand(score: number) {
  return score >= 75 ? "excellent" : score >= 55 ? "stable" : score >= 40 ? "attention" : "critical";
}

function karmaLabel(score: number) {
  return score >= 75 ? "Сильная" : score >= 55 ? "Стабильная" : score >= 40 ? "Внимание" : "Риск";
}
