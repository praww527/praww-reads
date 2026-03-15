import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../hooks/AuthContext";
import {
  ArrowLeft, Loader2, Send, Lock, ShieldCheck, AlertTriangle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getStoredPrivateKeyJwk,
  importPrivateKey,
  importPublicKey,
  encryptMessage,
  decryptMessage,
} from "../lib/e2e";

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
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) { navigate("/login"); return; }
    if (!authLoading && isAuthenticated) {
      init();
    }
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
      if (!pkJwk) {
        setKeyError("no_local_key");
        setLoading(false);
        return;
      }
      const pk = await importPrivateKey(pkJwk);
      setPrivateKey(pk);

      let recipKey = null;
      try {
        const res = await apiFetch(`/users/${userId}/public-key`);
        recipKey = await importPublicKey(res.public_key);
        setRecipientPublicKey(recipKey);
      } catch {
        setKeyError("no_recipient_key");
      }

      const profile = await apiFetch(`/profile/${userId}`).catch(() => null);
      setOtherUser(profile);

      await loadMessages(pk);

      pollRef.current = setInterval(() => loadMessages(pk), 5000);
    } catch (err) {
      setKeyError("init_error");
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(pk) {
    try {
      const msgs = await apiFetch(`/dm/${userId}`);
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
  }, [messages, privateKey]);

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
        body: JSON.stringify({
          receiver_id: userId,
          receiver_encrypted: receiverEnc,
          sender_encrypted: senderEnc,
        }),
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

  if (authLoading || loading) return <div className="flex justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary/50" /></div>;

  const otherName = otherUser
    ? (otherUser.first_name && otherUser.last_name
        ? `${otherUser.first_name} ${otherUser.last_name}`
        : otherUser.username || "User")
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
      </div>

      {/* Recipient key warning */}
      {keyError === "no_recipient_key" && (
        <div className="mb-3 shrink-0 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This user hasn't set up encrypted messaging yet. You can read their past messages but can't send new ones until they log in again.</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
            <Lock className="h-10 w-10 opacity-20" />
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map(m => {
          const isMine = m.sender_id === user?.id;
          const plain = decryptedCache[m.id];
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${isMine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
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
                </div>
              </div>
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
