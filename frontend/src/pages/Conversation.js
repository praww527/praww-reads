import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import {
  ArrowLeft, Loader2, Send, Lock, ShieldCheck, AlertTriangle,
  Pencil, Trash2, Check, X, Trash, MoreHorizontal
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getStoredPrivateKeyJwk,
  importPrivateKey,
  importPublicKey,
  encryptMessage,
  decryptMessage,
} from "../lib/e2e";

const EDIT_WINDOW_SECS = 240;

export default function Conversation() {
  const { userId } = useParams();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [privateKey, setPrivateKey] = useState(null);
  const [recipientPublicKey, setRecipientPublicKey] = useState(null);
  const [keyError, setKeyError] = useState("");
  const [decryptedCache, setDecryptedCache] = useState({});
  const [activeMsg, setActiveMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const touchStartX = useRef(null);
  const privateKeyRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) { navigate("/login"); return; }
    if (!authLoading && isAuthenticated) { init(); }
    return () => clearInterval(pollRef.current);
  }, [authLoading, isAuthenticated, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function init() {
    setLoading(true);
    setKeyError("");
    try {
      const pkJwk = getStoredPrivateKeyJwk();
      if (!pkJwk) { setKeyError("no_local_key"); setLoading(false); return; }
      const pk = await importPrivateKey(pkJwk);
      setPrivateKey(pk);
      privateKeyRef.current = pk;

      let recipKey = null;
      try {
        const res = await apiFetch(`/api/users/${userId}/public-key`);
        recipKey = await importPublicKey(res.public_key);
        setRecipientPublicKey(recipKey);
      } catch {
        setKeyError("no_recipient_key");
      }

      const profile = await apiFetch(`/api/profile/${userId}`).catch(() => null);
      setOtherUser(profile);
      await loadMessages(pk);
      pollRef.current = setInterval(() => loadMessages(privateKeyRef.current), 5000);
    } catch {
      setKeyError("init_error");
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(pk) {
    try {
      const msgs = await apiFetch(`/api/dm/${userId}`);
      setMessages(msgs);
      decryptAll(msgs, pk || privateKey);
    } catch {}
  }

  async function decryptAll(msgs, pk) {
    if (!pk) return;
    const uid = user?.id;
    const updates = {};
    await Promise.all(msgs.map(async (m) => {
      if (decryptedCache[m.id]) return;
      try {
        const payload = m.sender_id === uid ? m.sender_encrypted : m.receiver_encrypted;
        if (!payload) return;
        const plain = await decryptMessage(payload, pk);
        updates[m.id] = plain;
      } catch {
        updates[m.id] = "[Unable to decrypt]";
      }
    }));
    if (Object.keys(updates).length > 0) {
      setDecryptedCache(prev => ({ ...prev, ...updates }));
    }
  }

  useEffect(() => {
    if (messages.length > 0 && privateKey) {
      decryptAll(messages, privateKey);
    }
  }, [messages, privateKey, user]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || !privateKey || !recipientPublicKey || sending) return;
    setSending(true);
    try {
      const myPublicKeyJwk = JSON.parse(localStorage.getItem("praww_public_key"));
      const myPublicKey = await importPublicKey(myPublicKeyJwk);
      const [receiverEnc, senderEnc] = await Promise.all([
        encryptMessage(text.trim(), recipientPublicKey),
        encryptMessage(text.trim(), myPublicKey),
      ]);
      const msg = await apiFetch("/dm", {
        method: "POST",
        body: JSON.stringify({ receiver_id: userId, receiver_encrypted: receiverEnc, sender_encrypted: senderEnc }),
      });
      setMessages(prev => [...prev, msg]);
      setDecryptedCache(prev => ({ ...prev, [msg.id]: text.trim() }));
      setText("");
    } catch (err) {
      setSendError(err.message || "Failed to send message");
      setTimeout(() => setSendError(""), 4000);
    } finally {
      setSending(false);
    }
  }

  function canEdit(msg) {
    if (!msg.created_at) return false;
    const age = (Date.now() - new Date(msg.created_at).getTime()) / 1000;
    return age <= EDIT_WINDOW_SECS;
  }

  function startEdit(msg) {
    setEditingId(msg.id);
    setEditText(decryptedCache[msg.id] || "");
    setActiveMsg(null);
  }

  async function saveEdit(msg) {
    if (!editText.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const myPublicKeyJwk = JSON.parse(localStorage.getItem("praww_public_key"));
      const myPublicKey = await importPublicKey(myPublicKeyJwk);
      const [receiverEnc, senderEnc] = await Promise.all([
        encryptMessage(editText.trim(), recipientPublicKey),
        encryptMessage(editText.trim(), myPublicKey),
      ]);
      await apiFetch(`/dm/${msg.id}`, {
        method: "PATCH",
        body: JSON.stringify({ receiver_encrypted: receiverEnc, sender_encrypted: senderEnc }),
      });
      setDecryptedCache(prev => ({ ...prev, [msg.id]: editText.trim() }));
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, edited_at: new Date().toISOString() } : m));
      setEditingId(null);
      setEditText("");
    } catch (err) {
      setSendError(err.message || "Failed to edit message");
      setTimeout(() => setSendError(""), 4000);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteMessage(msgId) {
    setDeletingId(msgId);
    try {
      await apiFetch(`/dm/${msgId}`, { method: "DELETE" });
      setMessages(prev => prev.filter(m => m.id !== msgId));
      setActiveMsg(null);
    } catch {
    } finally {
      setDeletingId(null);
    }
  }

  async function clearConversation() {
    setClearing(true);
    try {
      await apiFetch(`/dm/conversation/${userId}`, { method: "DELETE" });
      setMessages([]);
      setDecryptedCache({});
      setClearConfirm(false);
    } catch {
    } finally {
      setClearing(false);
    }
  }

  function handleTouchStart(e, msgId) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e, msgId) {
    if (touchStartX.current === null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (dx > 50) {
      setActiveMsg(prev => prev === msgId ? null : msgId);
    } else if (dx < -50) {
      setActiveMsg(null);
    }
  }

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;

  const otherName = otherUser
    ? (otherUser.first_name && otherUser.last_name ? `${otherUser.first_name} ${otherUser.last_name}` : otherUser.username || "User")
    : "User";

  if (keyError === "no_local_key") {
    return (
      <div className="container mx-auto max-w-xl px-4 py-16 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
        <h2 className="font-serif text-2xl font-bold mb-2">Encryption keys not found</h2>
        <p className="text-muted-foreground mb-6">Your encryption keys aren't on this device. Try logging out and back in to generate them.</p>
        <Link to="/messages" className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted">Back to Messages</Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Link to="/messages" className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {otherUser?.profile_image_url ? (
          <img src={otherUser.profile_image_url} alt={otherName} className="w-9 h-9 rounded-full object-cover border border-border" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border border-border">
            {otherName[0]?.toUpperCase() || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${userId}`} className="font-semibold text-sm hover:text-primary transition-colors">{otherName}</Link>
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <ShieldCheck className="h-3 w-3" /> End-to-end encrypted
          </div>
        </div>
        {/* Clear conversation */}
        {messages.length > 0 && !clearConfirm && (
          <button
            onClick={() => setClearConfirm(true)}
            className="p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Clear conversation"
          >
            <Trash className="h-4 w-4" />
          </button>
        )}
        {clearConfirm && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-destructive font-medium">Clear all?</span>
            <button
              onClick={clearConversation}
              disabled={clearing}
              className="p-1.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
            >
              {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => setClearConfirm(false)} className="p-1.5 rounded-full hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Recipient key warning */}
      {keyError === "no_recipient_key" && (
        <div className="mb-3 shrink-0 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This user hasn't set up encrypted messaging yet. You can read their past messages but can't send new ones until they log in again.</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 py-2 pr-1" onClick={() => setActiveMsg(null)}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
            <Lock className="h-10 w-10 opacity-20" />
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map(m => {
          const isMine = m.sender_id === user?.id;
          const plain = decryptedCache[m.id];
          const isActive = activeMsg === m.id;
          const isEditing = editingId === m.id;
          const isDeleting = deletingId === m.id;

          return (
            <div
              key={m.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"} items-end gap-1.5 group`}
              onTouchStart={isMine ? (e) => handleTouchStart(e, m.id) : undefined}
              onTouchEnd={isMine ? (e) => handleTouchEnd(e, m.id) : undefined}
            >
              {/* Action buttons — revealed on swipe or click */}
              {isMine && isActive && !isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                  {canEdit(m) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(m); }}
                      className="p-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                      title="Edit (within 4 min)"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMessage(m.id); }}
                    disabled={isDeleting}
                    className="p-1.5 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-50"
                    title="Delete message"
                  >
                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}

              <div className={`max-w-[75%] ${isMine ? "order-last" : ""}`}>
                {isEditing ? (
                  <div className="flex items-end gap-1.5">
                    <div className="rounded-2xl bg-primary/10 border border-primary/30 overflow-hidden">
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        className="px-3 py-2 text-sm bg-transparent focus:outline-none resize-none w-full min-w-[200px]"
                        rows={Math.min(5, editText.split("\n").length + 1)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(m); }
                          if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => saveEdit(m)}
                        disabled={savingEdit || !editText.trim()}
                        className="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditText(""); }}
                        className="p-1.5 rounded-full bg-muted hover:bg-muted/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-sm cursor-pointer" : "bg-muted text-foreground rounded-bl-sm"}`}
                    onClick={isMine ? (e) => { e.stopPropagation(); setActiveMsg(prev => prev === m.id ? null : m.id); } : undefined}
                  >
                    {plain === undefined ? (
                      <span className="flex items-center gap-1 opacity-60 italic text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" /> Decrypting...
                      </span>
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{plain}</span>
                    )}
                    <div className={`text-xs mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"} flex items-center gap-1`}>
                      <Lock className="h-2.5 w-2.5" />
                      {m.created_at ? formatDistanceToNow(new Date(m.created_at)) + " ago" : ""}
                      {m.edited_at && <span className="italic">(edited)</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop: show options button on hover */}
              {isMine && !isEditing && !isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveMsg(m.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-muted text-muted-foreground transition-all shrink-0"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {sendError && (
        <div className="mb-2 shrink-0 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 text-sm">
          {sendError}
        </div>
      )}
      <form onSubmit={handleSend} className="mt-3 shrink-0 flex gap-2 items-end">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={keyError === "no_recipient_key" ? "Cannot send — recipient not set up" : "Type a message..."}
          disabled={!!keyError}
          className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); }
          }}
        />
        <button
          type="submit"
          disabled={!text.trim() || !!keyError || sending}
          className="rounded-xl bg-primary text-primary-foreground p-2.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
      <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
        <Lock className="h-3 w-3" /> Messages are encrypted on your device before sending
      </p>
    </div>
  );
}
