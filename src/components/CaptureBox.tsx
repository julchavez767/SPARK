"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { captureIdea, type CaptureState } from "@/app/(app)/actions";
import { LIMITS } from "@/lib/validation/idea";

const DRAFT_KEY = "spark:capture-draft";
const initial: CaptureState = { status: "idle" };

function readDraft(): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(value: string) {
  try {
    if (value) window.localStorage.setItem(DRAFT_KEY, value);
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked (private mode): capture still works, just without draft recovery.
  }
}

export function CaptureBox() {
  const [state, formAction, pending] = useActionState(captureIdea, initial);
  const [text, setText] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pulse, setPulse] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SparkSpeechRecognition | null>(null);
  const baseTextRef = useRef("");
  const restoredRef = useRef(false);

  // Restore an unsaved draft and detect dictation support after mount.
  useEffect(() => {
    const draft = readDraft();
    if (draft) setText(draft);
    restoredRef.current = true;
    setSpeechSupported(Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition));
  }, []);

  // Keep the draft in the browser until the server confirms the save.
  useEffect(() => {
    if (restoredRef.current) writeDraft(text);
  }, [text]);

  // On a confirmed save: clear, celebrate briefly, refocus for the next idea.
  useEffect(() => {
    if (state.status !== "saved") return;
    setText("");
    setUsedVoice(false);
    writeDraft("");
    setPulse(true);
    areaRef.current?.focus();
    const t = window.setTimeout(() => setPulse(false), 450);
    return () => window.clearTimeout(t);
  }, [state]);

  // Stop listening if the component unmounts.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    baseTextRef.current = text ? `${text.replace(/\s+$/, "")} ` : "";

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      setText(`${baseTextRef.current}${finalText}${interim}`.slice(0, LIMITS.body));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setUsedVoice(true);
    setListening(true);
    recognition.start();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const empty = text.trim().length === 0;

  return (
    <form
      ref={formRef}
      action={(fd) => {
        recognitionRef.current?.stop();
        formAction(fd);
      }}
      className={`rounded-[14px] border border-line bg-surface p-3 transition-shadow focus-within:border-ember ${pulse ? "spark-pulse" : ""}`}
    >
      <label htmlFor="capture" className="sr-only">
        New idea
      </label>
      <textarea
        ref={areaRef}
        id="capture"
        name="body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={LIMITS.body}
        rows={3}
        autoFocus
        placeholder="What’s the idea?"
        className="block min-h-24 w-full resize-y bg-transparent px-2 py-1 font-serif text-[17px] leading-relaxed outline-none placeholder:text-muted"
      />
      <input type="hidden" name="source" value={usedVoice ? "voice" : "text"} />

      <div className="mt-2 flex items-center gap-2">
        {speechSupported && (
          <button
            type="button"
            onClick={toggleDictation}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictation" : "Start dictation"}
            className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
              listening ? "border-ember bg-ember-soft text-ember" : "border-line text-muted hover:text-ink"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <span className="text-xs text-muted" aria-live="polite">
          {listening ? "Listening…" : state.status === "error" ? "" : "⌘/Ctrl + Enter to save"}
        </span>
        <button
          type="submit"
          disabled={empty || pending}
          className="ml-auto h-11 rounded-full bg-ember px-5 font-medium text-on-ember transition-opacity disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 px-2 pt-1 text-sm">
        {state.status === "error" && <span className="text-ember">{state.message}</span>}
        {state.status === "saved" && !pending && (
          <span className="text-muted">
            Saved “<span className="text-ink">{state.title}</span>”
          </span>
        )}
      </p>
    </form>
  );
}
