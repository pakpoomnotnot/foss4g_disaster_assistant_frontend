"use client";

import { useRef, useState } from "react";
import {
  queryDisaster,
  DisasterApiError,
  type Candidate,
  type QueryResultResponse,
} from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  candidates?: Candidate[];
}

interface Props {
  onResult: (result: QueryResultResponse) => void;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/// Mirrors the backend's rule (any Thai character means a Thai answer). Needed
/// here because these messages are shown when the request never came back, so
/// there is no `lang` from the server to follow.
function isThai(text: string) {
  return /[\u0E00-\u0E7F]/.test(text);
}

export default function DisasterChat({ onResult }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: newId(),
      role: "assistant",
      text: "ถามเกี่ยวกับน้ำท่วม ไฟป่า หรือภัยแล้งในไทยได้เลย เช่น \"flooding in Ayutthaya this week\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Tracks the last free-form question the user actually typed (not a candidate
  // pick) so we can keep the hazard/time-window words when re-asking with a
  // disambiguated location — otherwise the LLM has nothing left to extract from.
  const lastFreeformQueryRef = useRef("");
  // Set when the server said the question was complete except for the place.
  // The next thing typed is then the answer to that question, not a new one:
  // "วันนี้มีน้ำท่วมไหม" followed by "ขอนแก่น" has to search flood in Khon Kaen,
  // not search for the bare word "ขอนแก่น" with no hazard at all.
  const awaitingLocationForRef = useRef<string | null>(null);

  /// Folds a place into the question that was waiting for one. A plain append
  /// reads as one natural sentence, which the extractor handles far better than
  /// a bare place name or a structured rewrite.
  function withLocation(question: string, place: string) {
    return isThai(question)
      ? `${question} ที่${place}`
      : `${question} in ${place}`;
  }

  async function send(text: string, displayText?: string, areaIdn?: number) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", text: displayText ?? trimmed },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await queryDisaster(trimmed, areaIdn);
      if (res.needs_clarification) {
        // Remember the question so the next message can complete it. The
        // question kept is the one just sent, so a second failed attempt
        // refines rather than stacks.
        awaitingLocationForRef.current =
          res.missing === "location" ? trimmed : null;
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            text: res.message,
            candidates: res.candidates,
          },
        ]);
      } else {
        awaitingLocationForRef.current = null;
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", text: res.summary },
        ]);
        onResult(res);
      }
    } catch (err) {
      const th = isThai(trimmed);
      const message =
        err instanceof DisasterApiError
          ? th
            ? "ระบบขัดข้อง ลองใหม่อีกครั้ง"
            : "Something went wrong. Please try again."
          : th
            ? "เชื่อมต่อ backend ไม่ได้ — ตรวจสอบว่า backend รันอยู่ที่ localhost:8080"
            : "Cannot reach the backend — check that it is running on localhost:8080";
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", text: message },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function pickCandidate(c: Candidate) {
    // Re-send the ORIGINAL question so the hazard and time window survive, and
    // pass the chosen area as an id alongside it.
    //
    // This used to rewrite the sentence, swapping the ambiguous name for a
    // qualified one. That silently did nothing for a Thai question: it searched
    // the text for the English name ("Bang Phli"), which is not in "น้ำท่วมบางพลี",
    // so the identical ambiguous question went back out and the same chips came
    // back — an unbreakable loop. An id cannot be lost in translation.
    const base = lastFreeformQueryRef.current;
    const label = isThai(base) ? c.name_th : c.name_en;
    const shown = c.province ? `${label} (${c.province})` : label;
    send(base || label, shown, c.area_idn);
  }

  return (
    // min-h-0 is load-bearing: as a flex item this defaults to min-height:auto,
    // so once the message list grew past the sidebar's height the whole column
    // refused to shrink and pushed the input row out the bottom — underneath
    // the map, where the map's zoom control swallowed every click on "ส่ง".
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "text-right" : "text-left"}
          >
            <div
              className={
                "inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed " +
                (m.role === "user"
                  ? "bg-blue-600/90 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] backdrop-blur-sm"
                  : "glass-chip text-foreground")
              }
            >
              {m.text}
            </div>
            {m.candidates && m.candidates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.candidates.map((c) => (
                  <button
                    key={c.area_idn}
                    onClick={() => pickCandidate(c)}
                    className="glass-chip rounded-full px-3 py-1 text-xs text-foreground/80 transition-colors hover:text-foreground"
                  >
                    {c.name_th} ({c.name_en}
                    {c.province ? `, ${c.province}` : ""})
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-left text-sm text-foreground/55">กำลังค้นหา...</div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const pending = awaitingLocationForRef.current;
          const query = pending ? withLocation(pending, input.trim()) : input;
          lastFreeformQueryRef.current = query;
          // Shows what the user typed, sends the merged question.
          send(query, pending ? input.trim() : undefined);
        }}
        className="flex gap-2 border-t border-foreground/10 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="พิมพ์คำถาม..."
          disabled={loading}
          className="glass-chip min-w-0 flex-1 rounded-full px-4 py-2 text-sm text-foreground outline-none transition placeholder:text-foreground/40 focus:ring-2 focus:ring-blue-500/50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition hover:bg-blue-500 disabled:opacity-40 disabled:shadow-none"
        >
          ส่ง
        </button>
      </form>
    </div>
  );
}
