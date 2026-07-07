"use client";

/**
 * Study items — Flashcards and Quiz. Self-contained interactive items: the item
 * is the study/play surface; content (cards, questions) and full styling are
 * managed in the style panel. Wired in ItemRenderer via WithItemMenu.
 */

import { useMemo, useState } from "react";
import {
  RotateCw, ChevronLeft, ChevronRight, Check, X as XIcon,
  Plus, Trash2, RefreshCw, GraduationCap, HelpCircle,
  AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import { nanoid } from "nanoid";
import type { BlockItem, Flashcard, QuizQuestion } from "@/store/boardStore";
import { FontPicker } from "@/components/ui/FontPicker";
import { applyImageUpload } from "@/lib/storage";
import { cn } from "@/lib/utils";

type Upd = (p: Partial<BlockItem>) => void;

/** Item/board background style from an optional bg color + image. */
function bgStyle(color?: string, image?: string, size?: string): React.CSSProperties {
  return {
    backgroundColor: color,
    backgroundImage: image ? `url(${image})` : undefined,
    backgroundSize: image ? (size ?? "cover") : undefined,
    backgroundPosition: "center",
  };
}

function shuffledOrder(n: number, on?: boolean): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  if (on) for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

// ─── Flashcards ────────────────────────────────────────────────────────────────

export function FlashcardItem({ item, collapsed }: { item: BlockItem; upd: Upd; collapsed?: boolean; isFinished?: boolean }) {
  const cards = item.flashcards ?? [];
  const accent = item.flashcardAccent || "var(--accent)";
  const font = item.flashcardFontFamily || undefined;
  const fontSize = item.flashcardFontSize ?? 16;
  const textColor = item.flashcardTextColor || "var(--text-primary)";
  const frontBg = item.flashcardCardColor || "var(--surface-overlay)";
  const backBg = item.flashcardBackColor || `color-mix(in srgb, ${accent} 12%, var(--surface-overlay))`;
  const borderColor = item.flashcardBorderColor || `color-mix(in srgb, ${accent} 45%, transparent)`;
  const borderWidth = item.flashcardBorderWidth ?? 1;
  const radius = item.flashcardBorderRadius ?? 14;
  const shadow = item.flashcardShadow !== false;
  const flipMode = item.flashcardFlip ?? "flip";
  const align = (item.flashcardAlign ?? "center") as "left" | "center" | "right";
  const showProgress = item.flashcardShowProgress !== false;

  const order = useMemo(() => shuffledOrder(cards.length, item.flashcardShuffle), [cards.length, item.flashcardShuffle]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const itemBg = bgStyle(item.flashcardBgColor, item.flashcardBgImage, item.flashcardBgImageSize);

  if (cards.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center" style={{ fontFamily: font, ...itemBg }}>
        <GraduationCap size={22} className="text-[var(--text-muted)] opacity-40" />
        <p className="text-xs text-[var(--text-muted)]">No cards yet — add some in the style panel.</p>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="flex h-full flex-col justify-center gap-1 px-3" style={{ fontFamily: font, ...itemBg }}>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: accent }}><GraduationCap size={12} /> Flashcards</span>
        <span className="truncate text-xs" style={{ color: textColor }}>{cards[0]?.front || "—"}</span>
        <span className="text-[10px] text-[var(--text-muted)]">{cards.length} card{cards.length !== 1 ? "s" : ""}</span>
      </div>
    );
  }

  const safePos = Math.min(pos, order.length - 1);
  const card = cards[order[safePos]];
  const go = (d: number) => { setFlipped(false); setPos((p) => (p + d + order.length) % order.length); };

  const alignItems = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const faceBase: React.CSSProperties = {
    position: "absolute", inset: 0, display: "flex", flexDirection: "column",
    alignItems, justifyContent: "center", padding: 20, textAlign: align,
    borderRadius: radius, border: borderWidth ? `${borderWidth}px solid ${borderColor}` : undefined,
    boxShadow: shadow ? "0 6px 20px rgba(0,0,0,0.25)" : undefined,
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
  };
  const face = (txt: string, img: string | undefined, kind: string) => (
    <>
      <span style={{ position: "absolute", left: 12, top: 8, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: accent, opacity: 0.75 }}>{kind}</span>
      {img && <img src={img} alt="" className="mb-2 max-h-[58%] max-w-full rounded-lg object-contain" style={{ pointerEvents: "none" }} />}
      {txt ? (
        <span style={{ fontSize, fontWeight: 500, color: textColor, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{txt}</span>
      ) : (!img && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(empty)</span>)}
    </>
  );

  return (
    <div className="flex h-full w-full flex-col gap-2 p-3" style={{ fontFamily: font, ...itemBg }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative flex-1 cursor-pointer" style={{ perspective: 1200 }} onClick={() => setFlipped((f) => !f)}>
        {flipMode === "flip" ? (
          <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transition: "transform 0.5s", transform: flipped ? "rotateY(180deg)" : "none" }}>
            <div style={{ ...faceBase, background: frontBg }}>{face(card?.front ?? "", card?.frontImage, "Term")}</div>
            <div style={{ ...faceBase, background: backBg, transform: "rotateY(180deg)" }}>{face(card?.back ?? "", card?.backImage, "Answer")}</div>
          </div>
        ) : (
          <div style={{ ...faceBase, position: "absolute", background: flipped ? backBg : frontBg, transition: flipMode === "fade" ? "opacity 0.25s, background 0.25s" : undefined }}>
            {face(flipped ? (card?.back ?? "") : (card?.front ?? ""), flipped ? card?.backImage : card?.frontImage, flipped ? "Answer" : "Term")}
          </div>
        )}
        <span className="absolute bottom-2 right-3 z-10 flex items-center gap-1 text-[10px] text-[var(--text-muted)]"><RotateCw size={9} /> tap to flip</span>
      </div>
      {showProgress && (
        <div className="flex items-center justify-between">
          <button onClick={() => go(-1)} className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"><ChevronLeft size={16} /></button>
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{safePos + 1} / {order.length}</span>
          <button onClick={() => go(1)} className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

export function FlashcardStylePanel({ item, upd }: { item: BlockItem; upd: Upd }) {
  const cards = item.flashcards ?? [];
  const setCards = (next: Flashcard[]) => upd({ flashcards: next });
  const patch = (id: string, p: Partial<Flashcard>) => setCards(cards.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const align = item.flashcardAlign ?? "center";

  return (
    <div className="flex flex-col gap-0 divide-y divide-[var(--border)] text-xs">
      <section className="p-3">
        <SLabel>Cards</SLabel>
        <div className="flex flex-col gap-2">
          {cards.map((c, i) => (
            <div key={c.id} className="flex flex-col gap-1 rounded-lg border border-[var(--border)] p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[var(--text-muted)]">Card {i + 1}</span>
                <button onClick={() => setCards(cards.filter((x) => x.id !== c.id))} className="text-[var(--text-muted)] transition-colors hover:text-red-400"><Trash2 size={11} /></button>
              </div>
              <input value={c.front} onChange={(e) => patch(c.id, { front: e.target.value })} placeholder="Term / question" className={inputCls} />
              <input value={c.back} onChange={(e) => patch(c.id, { back: e.target.value })} placeholder="Answer / definition" className={inputCls} />
              <div className="flex gap-1.5">
                <ImgUpload label={c.frontImage ? "Front image ✓" : "+ Front image"} has={!!c.frontImage} onPick={(url) => patch(c.id, { frontImage: url })} onClear={() => patch(c.id, { frontImage: undefined })} />
                <ImgUpload label={c.backImage ? "Back image ✓" : "+ Back image"} has={!!c.backImage} onPick={(url) => patch(c.id, { backImage: url })} onClear={() => patch(c.id, { backImage: undefined })} />
              </div>
            </div>
          ))}
          <button onClick={() => setCards([...cards, { id: nanoid(), front: "", back: "" }])} className={addCls}><Plus size={11} /> Add card</button>
        </div>
      </section>

      <section className="p-3">
        <SLabel>Text</SLabel>
        <div className="flex flex-col gap-2">
          <Row label="Font"><FontPicker value={item.flashcardFontFamily ?? ""} onChange={(v) => upd({ flashcardFontFamily: v })} /></Row>
          <SliderRow label="Size" value={item.flashcardFontSize ?? 16} min={11} max={32} step={1} onChange={(v) => upd({ flashcardFontSize: v })} />
          <ColorRow label="Text color" value={item.flashcardTextColor} fallback="#f2f2f2" onChange={(v) => upd({ flashcardTextColor: v })} onClear={() => upd({ flashcardTextColor: undefined })} />
          <Row label="Align">
            <div className="flex gap-1">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                <button key={a} onClick={() => upd({ flashcardAlign: a })}
                  className={cn("rounded border p-1 transition-colors", align === a ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]")}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
          </Row>
        </div>
      </section>

      <section className="p-3">
        <SLabel>Card style</SLabel>
        <div className="flex flex-col gap-2">
          <ColorRow label="Accent" value={item.flashcardAccent} fallback="#d59ee8" onChange={(v) => upd({ flashcardAccent: v })} onClear={() => upd({ flashcardAccent: undefined })} />
          <ColorRow label="Front face" value={item.flashcardCardColor} fallback="#26272e" onChange={(v) => upd({ flashcardCardColor: v })} onClear={() => upd({ flashcardCardColor: undefined })} />
          <ColorRow label="Back face" value={item.flashcardBackColor} fallback="#2b2733" onChange={(v) => upd({ flashcardBackColor: v })} onClear={() => upd({ flashcardBackColor: undefined })} />
          <ColorRow label="Item bg" value={item.flashcardBgColor} fallback="#1a1b1e" onChange={(v) => upd({ flashcardBgColor: v })} onClear={() => upd({ flashcardBgColor: undefined })} />
          <ImgRow label="Background image" has={!!item.flashcardBgImage} onPick={(url) => upd({ flashcardBgImage: url })} onClear={() => upd({ flashcardBgImage: undefined })} />
          <ColorRow label="Border" value={item.flashcardBorderColor} fallback="#3a3a44" onChange={(v) => upd({ flashcardBorderColor: v })} onClear={() => upd({ flashcardBorderColor: undefined })} />
          <SliderRow label="Border width" value={item.flashcardBorderWidth ?? 1} min={0} max={4} step={1} onChange={(v) => upd({ flashcardBorderWidth: v })} />
          <SliderRow label="Corner radius" value={item.flashcardBorderRadius ?? 14} min={0} max={28} step={1} onChange={(v) => upd({ flashcardBorderRadius: v })} />
          <ToggleRow label="Shadow" on={item.flashcardShadow !== false} onClick={() => upd({ flashcardShadow: !(item.flashcardShadow !== false) })} />
        </div>
      </section>

      <section className="p-3">
        <SLabel>Behavior</SLabel>
        <div className="flex flex-col gap-2">
          <Row label="Flip">
            <select value={item.flashcardFlip ?? "flip"} onChange={(e) => upd({ flashcardFlip: e.target.value })} className={selectCls}>
              <option value="flip">3D flip</option>
              <option value="fade">Fade</option>
              <option value="none">Instant</option>
            </select>
          </Row>
          <ToggleRow label="Shuffle" on={!!item.flashcardShuffle} onClick={() => upd({ flashcardShuffle: !item.flashcardShuffle })} />
          <ToggleRow label="Show progress" on={item.flashcardShowProgress !== false} onClick={() => upd({ flashcardShowProgress: !(item.flashcardShowProgress !== false) })} />
        </div>
      </section>
    </div>
  );
}

// ─── Quiz ────────────────────────────────────────────────────────────────────

export function QuizItem({ item, collapsed }: { item: BlockItem; upd: Upd; collapsed?: boolean; isFinished?: boolean }) {
  const questions = item.quizQuestions ?? [];
  const accent = item.quizAccent || "var(--accent)";
  const font = item.quizFontFamily || undefined;
  const fontSize = item.quizFontSize ?? 14;
  const textColor = item.quizTextColor || "var(--text-primary)";
  const optionBg = item.quizOptionColor || "transparent";
  const correctColor = item.quizCorrectColor || "#48cfa6";
  const incorrectColor = item.quizIncorrectColor || "#eb5757";
  const radius = item.quizBorderRadius ?? 8;
  const showProgress = item.quizShowProgress !== false;
  const showNumbers = !!item.quizNumbers;
  const instant = item.quizInstant !== false;
  const itemBg = bgStyle(item.quizBgColor, item.quizBgImage, item.quizBgImageSize);
  const order = useMemo(() => shuffledOrder(questions.length, item.quizShuffle), [questions.length, item.quizShuffle]);

  const [pos, setPos] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);
  const reset = () => { setPos(0); setAnswers({}); setDone(false); };

  if (questions.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center" style={{ fontFamily: font, ...itemBg }}>
        <HelpCircle size={22} className="text-[var(--text-muted)] opacity-40" />
        <p className="text-xs text-[var(--text-muted)]">No questions yet — add some in the style panel.</p>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="flex h-full flex-col justify-center gap-1 px-3" style={{ fontFamily: font, ...itemBg }}>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: accent }}><HelpCircle size={12} /> Quiz</span>
        <span className="truncate text-xs" style={{ color: textColor }}>{questions[0]?.prompt || "—"}</span>
        <span className="text-[10px] text-[var(--text-muted)]">{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
      </div>
    );
  }

  if (done) {
    const score = order.reduce((acc, qi, i) => acc + (questions[qi]?.correctIndex === answers[i] ? 1 : 0), 0);
    const pct = Math.round((score / order.length) * 100);
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center" style={{ fontFamily: font, ...itemBg }} onPointerDown={(e) => e.stopPropagation()}>
        <span className="text-3xl font-bold" style={{ color: accent }}>{score}/{order.length}</span>
        <span className="text-xs text-[var(--text-muted)]">{pct}% correct</span>
        <button onClick={reset} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
          <RefreshCw size={12} /> Retake
        </button>
      </div>
    );
  }

  const q = questions[order[pos]];
  const chosen = answers[pos];
  const answered = chosen !== undefined;
  const choose = (i: number) => { if (answered && instant) return; setAnswers((a) => ({ ...a, [pos]: i })); };
  const next = () => { if (pos + 1 >= order.length) setDone(true); else setPos(pos + 1); };

  return (
    <div className="flex h-full w-full flex-col gap-2 p-3" style={{ fontFamily: font, ...itemBg }} onPointerDown={(e) => e.stopPropagation()}>
      {(showProgress || showNumbers) && (
        <div className="flex items-center gap-2">
          {showProgress && (
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-overlay)]">
              <div className="h-full rounded-full transition-all" style={{ width: `${((pos + 1) / order.length) * 100}%`, background: accent }} />
            </div>
          )}
          {(showNumbers || !showProgress) && <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{pos + 1}/{order.length}</span>}
        </div>
      )}
      <p className="font-medium" style={{ fontSize: fontSize + 1, color: textColor }}>{q?.prompt || <span className="italic text-[var(--text-muted)]">(no prompt)</span>}</p>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {(q?.options ?? []).map((opt, i) => {
          const isChosen = chosen === i;
          const showRight = instant && answered && i === q.correctIndex;
          const showWrong = instant && answered && isChosen && i !== q.correctIndex;
          const bColor = showRight ? correctColor : showWrong ? incorrectColor : isChosen ? accent : "var(--border)";
          const bg = showRight ? `color-mix(in srgb, ${correctColor} 12%, transparent)`
            : showWrong ? `color-mix(in srgb, ${incorrectColor} 12%, transparent)`
            : isChosen ? `color-mix(in srgb, ${accent} 10%, transparent)` : optionBg;
          return (
            <button key={i} onClick={() => choose(i)} disabled={answered && instant}
              className="flex items-center justify-between gap-2 border px-3 py-2 text-left transition-colors"
              style={{ borderRadius: radius, borderColor: bColor, background: bg, color: textColor, fontSize }}>
              <span className="whitespace-pre-wrap break-words">{opt || <span className="italic opacity-60">(empty)</span>}</span>
              {showRight && <Check size={13} style={{ color: correctColor }} className="flex-shrink-0" />}
              {showWrong && <XIcon size={13} style={{ color: incorrectColor }} className="flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      <button onClick={next} disabled={!answered} className="py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40" style={{ background: accent, borderRadius: radius }}>
        {pos + 1 >= order.length ? "Finish" : "Next"}
      </button>
    </div>
  );
}

export function QuizStylePanel({ item, upd }: { item: BlockItem; upd: Upd }) {
  const questions = item.quizQuestions ?? [];
  const setQs = (next: QuizQuestion[]) => upd({ quizQuestions: next });
  const patch = (id: string, p: Partial<QuizQuestion>) => setQs(questions.map((q) => (q.id === id ? { ...q, ...p } : q)));

  return (
    <div className="flex flex-col gap-0 divide-y divide-[var(--border)] text-xs">
      <section className="p-3">
        <SLabel>Questions</SLabel>
        <div className="flex flex-col gap-2">
          {questions.map((q, qi) => (
            <div key={q.id} className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[var(--text-muted)]">Q{qi + 1}</span>
                <button onClick={() => setQs(questions.filter((x) => x.id !== q.id))} className="text-[var(--text-muted)] transition-colors hover:text-red-400"><Trash2 size={11} /></button>
              </div>
              <input value={q.prompt} onChange={(e) => patch(q.id, { prompt: e.target.value })} placeholder="Question" className={inputCls} />
              <div className="flex flex-col gap-1">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-1.5">
                    <button onClick={() => patch(q.id, { correctIndex: oi })} title="Mark correct"
                      className={cn("flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-colors", q.correctIndex === oi ? "border-transparent bg-green-500 text-white" : "border-[var(--border)] text-transparent hover:border-green-500")}>
                      <Check size={9} />
                    </button>
                    <input value={opt} onChange={(e) => patch(q.id, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })} placeholder={`Option ${oi + 1}`}
                      className="flex-1 min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                    {q.options.length > 2 && (
                      <button onClick={() => patch(q.id, { options: q.options.filter((_, k) => k !== oi), correctIndex: q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex })} className="text-[var(--text-muted)] transition-colors hover:text-red-400"><XIcon size={10} /></button>
                    )}
                  </div>
                ))}
                {q.options.length < 6 && (
                  <button onClick={() => patch(q.id, { options: [...q.options, ""] })} className="flex items-center gap-1 text-[11px] text-[var(--accent)] transition-opacity hover:opacity-80"><Plus size={10} /> Add option</button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => setQs([...questions, { id: nanoid(), prompt: "", options: ["", ""], correctIndex: 0 }])} className={addCls}><Plus size={11} /> Add question</button>
        </div>
      </section>

      <section className="p-3">
        <SLabel>Text</SLabel>
        <div className="flex flex-col gap-2">
          <Row label="Font"><FontPicker value={item.quizFontFamily ?? ""} onChange={(v) => upd({ quizFontFamily: v })} /></Row>
          <SliderRow label="Size" value={item.quizFontSize ?? 14} min={11} max={22} step={1} onChange={(v) => upd({ quizFontSize: v })} />
          <ColorRow label="Text color" value={item.quizTextColor} fallback="#f2f2f2" onChange={(v) => upd({ quizTextColor: v })} onClear={() => upd({ quizTextColor: undefined })} />
        </div>
      </section>

      <section className="p-3">
        <SLabel>Colors</SLabel>
        <div className="flex flex-col gap-2">
          <ColorRow label="Accent" value={item.quizAccent} fallback="#d59ee8" onChange={(v) => upd({ quizAccent: v })} onClear={() => upd({ quizAccent: undefined })} />
          <ColorRow label="Option bg" value={item.quizOptionColor} fallback="#26272e" onChange={(v) => upd({ quizOptionColor: v })} onClear={() => upd({ quizOptionColor: undefined })} />
          <ColorRow label="Correct" value={item.quizCorrectColor} fallback="#48cfa6" onChange={(v) => upd({ quizCorrectColor: v })} onClear={() => upd({ quizCorrectColor: undefined })} />
          <ColorRow label="Incorrect" value={item.quizIncorrectColor} fallback="#eb5757" onChange={(v) => upd({ quizIncorrectColor: v })} onClear={() => upd({ quizIncorrectColor: undefined })} />
          <ColorRow label="Item bg" value={item.quizBgColor} fallback="#1a1b1e" onChange={(v) => upd({ quizBgColor: v })} onClear={() => upd({ quizBgColor: undefined })} />
          <ImgRow label="Background image" has={!!item.quizBgImage} onPick={(url) => upd({ quizBgImage: url })} onClear={() => upd({ quizBgImage: undefined })} />
          <SliderRow label="Corner radius" value={item.quizBorderRadius ?? 8} min={0} max={20} step={1} onChange={(v) => upd({ quizBorderRadius: v })} />
        </div>
      </section>

      <section className="p-3">
        <SLabel>Behavior</SLabel>
        <div className="flex flex-col gap-2">
          <ToggleRow label="Instant feedback" on={item.quizInstant !== false} onClick={() => upd({ quizInstant: !(item.quizInstant !== false) })} />
          <ToggleRow label="Shuffle" on={!!item.quizShuffle} onClick={() => upd({ quizShuffle: !item.quizShuffle })} />
          <ToggleRow label="Progress bar" on={item.quizShowProgress !== false} onClick={() => upd({ quizShowProgress: !(item.quizShowProgress !== false) })} />
          <ToggleRow label="Question numbers" on={!!item.quizNumbers} onClick={() => upd({ quizNumbers: !item.quizNumbers })} />
        </div>
      </section>
    </div>
  );
}

// ─── Shared panel bits ───────────────────────────────────────────────────────

const inputCls = "rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const addCls = "flex items-center gap-1 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]";
const selectCls = "rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-primary)] outline-none";

function SLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-[var(--text-secondary)]">{label}</span>{children}</div>;
}
function ToggleRow({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <Row label={label}>
      <button onClick={onClick} className={cn("h-4 w-8 rounded-full transition-colors", on ? "bg-[var(--accent)]" : "bg-[var(--surface-overlay)]")}>
        <div className={cn("mx-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-0")} />
      </button>
    </Row>
  );
}
function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-1.5">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 w-20 cursor-pointer accent-[var(--accent)]" />
        <span className="w-6 text-right tabular-nums text-[var(--text-muted)]">{value}</span>
      </div>
    </Row>
  );
}
function ColorRow({ label, value, fallback, onChange, onClear }: { label: string; value?: string; fallback: string; onChange: (v: string) => void; onClear: () => void }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value && value.startsWith("#") ? value : fallback} onChange={(e) => onChange(e.target.value)} className="h-6 w-9 cursor-pointer rounded border-0 p-0" />
        {value && <button onClick={onClear} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">clear</button>}
      </div>
    </Row>
  );
}
/** Compact image picker (uploads via applyImageUpload → data URL now, storage URL after). */
function ImgUpload({ label, has, onPick, onClear }: { label: string; has?: boolean; onPick: (url: string) => void; onClear?: () => void }) {
  return (
    <div className="flex flex-1 items-center gap-1">
      <label className="flex flex-1 cursor-pointer items-center justify-center rounded border border-dashed border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
        {label}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) applyImageUpload(f, onPick); e.currentTarget.value = ""; }} />
      </label>
      {has && onClear && <button onClick={onClear} className="text-[var(--text-muted)] hover:text-red-400"><XIcon size={10} /></button>}
    </div>
  );
}
function ImgRow({ label, has, onPick, onClear }: { label: string; has?: boolean; onPick: (url: string) => void; onClear: () => void }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-1.5">
        {has && <button onClick={onClear} className="text-[10px] text-[var(--text-muted)] hover:text-red-400">remove</button>}
        <label className="cursor-pointer rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]">
          {has ? "Replace" : "Upload"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) applyImageUpload(f, onPick); e.currentTarget.value = ""; }} />
        </label>
      </div>
    </Row>
  );
}
