"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  BusinessQuestionConversationMode,
  BusinessQuestionMessageRecord,
  BusinessQuestionThreadRecord,
  createBusinessQuestionThread,
  fetchBusinessQuestionMessages,
  fetchBusinessQuestionThreads,
  sendBusinessQuestionMessage,
} from "@/lib/firebase/repositories";

export function BusinessQuestionsSection({
  businessId,
  businessName,
  conversationMode,
}: {
  businessId: string;
  businessName: string;
  conversationMode: BusinessQuestionConversationMode;
}) {
  const { user, hasFirebaseConfig } = useAuth();
  const [threads, setThreads] = useState<BusinessQuestionThreadRecord[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [messages, setMessages] = useState<BusinessQuestionMessageRecord[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [questionTitle, setQuestionTitle] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [replyText, setReplyText] = useState("");

  const selectedThread = useMemo(
    () => threads.find((row) => row.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );
  const canReply = Boolean(
    user &&
      selectedThread &&
      (selectedThread.customerUid === user.uid ||
        selectedThread.ownerUid === user.uid ||
        selectedThread.participantUids.includes(user.uid)),
  );

  const loadThreads = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setLoadingThreads(false);
      return;
    }
    setLoadingThreads(true);
    setError(null);
    try {
      const rows = await fetchBusinessQuestionThreads({
        businessId,
        viewerUid: user?.uid,
      });
      setThreads(rows);
      setSelectedThreadId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? "";
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load business conversations.",
      );
    } finally {
      setLoadingThreads(false);
    }
  }, [businessId, hasFirebaseConfig, user?.uid]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    let active = true;
    async function loadMessages() {
      if (!selectedThreadId || !hasFirebaseConfig) {
        setMessages([]);
        return;
      }
      setLoadingMessages(true);
      try {
        const rows = await fetchBusinessQuestionMessages({
          businessId,
          threadId: selectedThreadId,
          viewerUid: user?.uid,
        });
        if (active) setMessages(rows);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load conversation messages.",
        );
      } finally {
        if (active) setLoadingMessages(false);
      }
    }
    void loadMessages();
    return () => {
      active = false;
    };
  }, [businessId, hasFirebaseConfig, selectedThreadId, user?.uid]);

  async function createQuestion(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setError("Sign in to ask a question.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await createBusinessQuestionThread({
        businessId,
        customerUid: user.uid,
        customerName: user.displayName ?? "Customer",
        customerEmail: user.email ?? "",
        title: questionTitle,
        text: questionText,
      });
      setInfo(
        result.mode === "public"
          ? "Question posted in public conversation feed."
          : "Private question created for direct discussion.",
      );
      setQuestionTitle("");
      setQuestionText("");
      await loadThreads();
      setSelectedThreadId(result.threadId);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create question right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!user || !selectedThread) {
      setError("Select a conversation first.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await sendBusinessQuestionMessage({
        businessId,
        threadId: selectedThread.id,
        senderUid: user.uid,
        senderName: user.displayName ?? "User",
        text: replyText,
      });
      setReplyText("");
      await loadThreads();
      const nextMessages = await fetchBusinessQuestionMessages({
        businessId,
        threadId: selectedThread.id,
        viewerUid: user.uid,
      });
      setMessages(nextMessages);
    } catch (replyError) {
      setError(
        replyError instanceof Error
          ? replyError.message
          : "Unable to send message right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="questions" className="glass rounded-3xl p-6">
      <h2 className="text-lg font-semibold tracking-tight">Customer questions</h2>
      <p className="mt-1 text-xs text-muted">
        Owner mode: {conversationMode === "public" ? "Public" : "Private"}.
        {conversationMode === "public"
          ? " Everyone can read posted conversations."
          : " Only customer and business owner can read each conversation."}
      </p>

      {!hasFirebaseConfig && (
        <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          Firebase config missing in `.env.local`.
        </p>
      )}
      {info && (
        <p className="mt-3 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm">
          {info}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form onSubmit={createQuestion} className="mt-4 grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-medium">Ask a question about {businessName}</p>
        <input
          value={questionTitle}
          onChange={(event) => setQuestionTitle(event.target.value)}
          placeholder="Question title"
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
        />
        <textarea
          value={questionText}
          onChange={(event) => setQuestionText(event.target.value)}
          rows={3}
          placeholder="Write your question..."
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={busy || !user}
          className="w-fit rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
        >
          {busy ? "Posting..." : user ? "Post question" : "Sign in to ask question"}
        </button>
      </form>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {loadingThreads && (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
              Loading conversations...
            </p>
          )}
          {!loadingThreads && !threads.length && (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
              No questions posted yet.
            </p>
          )}
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => setSelectedThreadId(thread.id)}
              className={`block w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                selectedThreadId === thread.id
                  ? "border-brand bg-brand/10"
                  : "border-border bg-surface hover:border-brand/40"
              }`}
            >
              <p className="font-medium">{thread.title}</p>
              <p className="mt-1 text-xs text-muted">
                {thread.mode} | {thread.messagesCount} messages | {new Date(thread.updatedAt).toLocaleString()}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{thread.lastMessage}</p>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-surface p-3">
          {!selectedThread && (
            <p className="text-sm text-muted">Select a conversation to view messages.</p>
          )}
          {selectedThread && (
            <div className="space-y-3">
              <div>
                <p className="font-medium">{selectedThread.title}</p>
                <p className="text-xs text-muted">
                  Mode {selectedThread.mode} | Opened by {selectedThread.customerName}
                </p>
              </div>
              {loadingMessages && <p className="text-sm text-muted">Loading messages...</p>}
              {!loadingMessages && (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {!messages.length && <p className="text-sm text-muted">No messages yet.</p>}
                  {messages.map((message) => (
                    <article key={message.id} className="rounded-lg border border-border bg-white p-2 text-sm">
                      <p className="font-medium">
                        {message.senderName}{" "}
                        <span className="text-xs text-muted">({message.senderRole})</span>
                      </p>
                      <p className="mt-1">{message.text}</p>
                      <p className="mt-1 text-xs text-muted">{new Date(message.createdAt).toLocaleString()}</p>
                    </article>
                  ))}
                </div>
              )}
              <form onSubmit={sendReply} className="space-y-2">
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  rows={2}
                  placeholder={canReply ? "Write your reply..." : "Only business owner and customer can reply."}
                  disabled={!canReply}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none disabled:opacity-70"
                />
                <button
                  type="submit"
                  disabled={busy || !canReply}
                  className="rounded-xl border border-border px-3 py-2 text-sm transition hover:border-brand/40 disabled:opacity-70"
                >
                  {busy ? "Sending..." : "Send reply"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

