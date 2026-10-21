"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { ArrowLeft, Check, CheckCheck, ChevronDown, FilePlus2, ImagePlus, LoaderCircle, MessageCircle, Pencil, Plus, Search, Send, Settings2, Smile, Trash2, UserPlus, Users, Video, X } from "lucide-react";
import { upload } from "@/components/social-panels";

type Person = { id: string; name: string; image: string | null };
type Participant = { userId: string; role: string; lastReadAt: string | null; user: Person };
type Reaction = { userId: string; type: string };
type Message = { id: string; conversationId: string; content: string; createdAt: string; editedAt: string | null; attachmentUrl: string | null; attachmentKey: string | null; sender: Person; reactions: Reaction[] };
type Conversation = { id: string; title: string | null; isGroup: boolean; updatedAt: string; participants: Participant[]; messages: Message[] };
type FriendPayload = { requester: Person; addressee: Person };

const reactionChoices = [
  { type: "LIKE", emoji: "👍", label: "Like" }, { type: "LOVE", emoji: "❤️", label: "Love" },
  { type: "HAHA", emoji: "😂", label: "Haha" }, { type: "WOW", emoji: "😮", label: "Wow" },
  { type: "SAD", emoji: "😢", label: "Sad" }, { type: "ANGRY", emoji: "😡", label: "Angry" },
];
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const softButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50";

function Avatar({ person, size = "md", online = false }: { person: Person; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const dimensions = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-9 w-9" : "h-10 w-10";
  const initials = person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <span className={`relative inline-flex shrink-0 ${dimensions}`}>
    {person.image ? <img src={person.image} alt="" className={`${dimensions} rounded-full object-cover`} /> : <span className={`grid ${dimensions} place-items-center rounded-full bg-blue-100 font-bold text-blue-700`}>{initials}</span>}
    {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" title="Active now" />}
  </span>;
}

function conversationName(conversation: Conversation, currentUserId: string) {
  return conversation.title || conversation.participants.filter((participant) => participant.userId !== currentUserId).map((participant) => participant.user.name).join(", ") || "Just you";
}

function getUnread(conversation: Conversation, userId: string) {
  const latest = conversation.messages[0];
  const ownParticipant = conversation.participants.find((participant) => participant.userId === userId);
  return Boolean(latest && latest.sender.id !== userId && (!ownParticipant?.lastReadAt || new Date(latest.createdAt) > new Date(ownParticipant.lastReadAt)));
}

function MessageAttachment({ message }: { message: Message }) {
  if (!message.attachmentUrl) return null;
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(message.attachmentUrl);
  return isVideo
    ? <video controls preload="metadata" src={message.attachmentUrl} className="mt-2 max-h-80 max-w-full rounded-xl bg-black" />
    : <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 block"><img src={message.attachmentUrl} alt="Message attachment" className="max-h-80 max-w-full rounded-xl object-contain" /></a>;
}

export function MessengerPanel({ user, initialConversationId, onClose }: { user: Person; initialConversationId?: string | null; onClose?: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Person[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<string | null>(initialConversationId ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [listMode, setListMode] = useState<"all" | "unread">("all");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [addingPeople, setAddingPeople] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const reloadConversations = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      if (response.ok) setConversations(await response.json());
      else if (response.status === 401) setError("Your session expired. Sign in again to open Messenger.");
    } catch { setError("Could not load conversations. Check your connection and retry."); }
    finally { if (showLoader) setLoading(false); }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, cursor?: string, appendOlder = false) => {
    const response = await fetch(`/api/conversations/${conversationId}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
    if (!response.ok) {
      if (response.status === 404) setError("You no longer have access to this conversation.");
      return;
    }
    const data = await response.json() as { items: Message[]; nextCursor: string | null };
    if (appendOlder) {
      const element = scrollRef.current;
      const oldHeight = element?.scrollHeight ?? 0;
      setMessages((current) => [...data.items, ...current.filter((message) => !data.items.some((older) => older.id === message.id))]);
      requestAnimationFrame(() => { if (element) element.scrollTop += element.scrollHeight - oldHeight; });
    } else {
      setMessages((current) => {
        const byId = new Map(current.map((message) => [message.id, message]));
        for (const message of data.items) byId.set(message.id, message);
        return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    }
    setNextCursor(data.nextCursor);
  }, []);

  useEffect(() => {
    void reloadConversations(true);
    void fetch("/api/friends").then((response) => response.ok ? response.json() : null).then((data) => {
      if (data) setContacts(data.accepted.map((friendship: FriendPayload) => friendship.requester.id === user.id ? friendship.addressee : friendship.requester));
    }).catch(() => setError("Could not load your friends list."));
    const timer = setInterval(() => void reloadConversations(), 12000);
    return () => clearInterval(timer);
  }, [reloadConversations, user.id]);

  useEffect(() => {
    let active = true;
    void fetch("/api/realtime/token").then((response) => response.ok ? response.json() : Promise.reject()).then(({ token }: { token: string }) => {
      if (!active) return;
      const client = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://127.0.0.1:3001", { auth: { token }, transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity });
      socketRef.current = client;
      setSocket(client);
      client.on("presence", (event: { userId: string; online: boolean }) => setOnlineUsers((current) => event.online ? [...new Set([...current, event.userId])] : current.filter((id) => id !== event.userId)));
      client.on("presence:sync", (event: { onlineUserIds: string[] }) => setOnlineUsers(event.onlineUserIds));
      client.on("typing", (event: { conversationId: string; userId: string; typing: boolean }) => {
        if (event.userId === user.id || event.conversationId !== selectedRef.current) return;
        setTypingUserId(event.typing ? event.userId : null);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        if (event.typing) typingTimeout.current = setTimeout(() => setTypingUserId(null), 2800);
      });
      client.on("message:new", (message: Message) => {
        if (message.conversationId === selectedRef.current) {
          setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
          void fetch(`/api/conversations/${message.conversationId}/messages`, { method: "PATCH" });
          client.emit("conversation:read", { conversationId: message.conversationId });
        }
        void reloadConversations();
      });
      client.on("message:updated", (message: Message) => setMessages((current) => current.map((item) => item.id === message.id ? message : item)));
      client.on("message:deleted", (event: { conversationId: string; messageId: string }) => setMessages((current) => current.filter((item) => item.id !== event.messageId)));
      client.on("read:receipt", (event: { conversationId: string; userId: string; readAt: string }) => {
        setConversations((current) => current.map((conversation) => conversation.id !== event.conversationId ? conversation : { ...conversation, participants: conversation.participants.map((participant) => participant.userId === event.userId ? { ...participant, lastReadAt: event.readAt } : participant) }));
      });
      client.on("connect_error", () => setError("Live updates are offline. Messenger will keep checking for new messages."));
      client.on("connect", () => {
        setError((current) => current.startsWith("Live updates") ? "" : current);
        const activeConversationId = selectedRef.current;
        if (activeConversationId) client.emit("conversation:join", { conversationId: activeConversationId });
        if (contacts.length) client.emit("presence:check", contacts.map((contact) => contact.id));
      });
    }).catch(() => setError("Live updates are unavailable. Messenger will use automatic refresh."));
    return () => { active = false; socketRef.current?.disconnect(); socketRef.current = null; if (typingTimeout.current) clearTimeout(typingTimeout.current); };
  }, [contacts, reloadConversations, user.id]);

  useEffect(() => {
    if (!socket || !contacts.length) return;
    socket.emit("presence:check", contacts.map((contact) => contact.id));
  }, [contacts, socket]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let active = true;
    setMessages([]);
    setNextCursor(null);
    setTypingUserId(null);
    setError("");
    const refresh = async () => {
      if (!active) return;
      await loadMessages(selected);
    };
    void refresh().then(() => {
      if (!active) return;
      const ownReadAt = new Date().toISOString();
      void fetch(`/api/conversations/${selected}/messages`, { method: "PATCH" }).then(() => reloadConversations());
      socketRef.current?.emit("conversation:read", { conversationId: selected, readAt: ownReadAt });
      socketRef.current?.emit("conversation:join", { conversationId: selected }, (ack: { ok: boolean }) => { if (!ack?.ok) setError("Could not join this conversation."); });
    });
    const timer = setInterval(() => void refresh(), 3000);
    return () => { active = false; clearInterval(timer); socketRef.current?.emit("conversation:leave", { conversationId: selected }); };
  }, [loadMessages, reloadConversations, selected, socket]);

  useEffect(() => {
    if (!selected || !messages.length) return;
    tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selected, messages.at(-1)?.id]);

  const currentConversation = conversations.find((conversation) => conversation.id === selected) ?? null;
  const unreadTotal = conversations.filter((conversation) => getUnread(conversation, user.id)).length;
  const filteredConversations = useMemo(() => conversations.filter((conversation) => {
    if (listMode === "unread" && !getUnread(conversation, user.id)) return false;
    const term = search.trim().toLowerCase();
    return !term || conversationName(conversation, user.id).toLowerCase().includes(term) || (conversation.messages[0]?.content ?? "").toLowerCase().includes(term);
  }), [conversations, listMode, search, user.id]);
  const filteredContacts = useMemo(() => contacts.filter((contact) => contact.name.toLowerCase().includes(friendSearch.trim().toLowerCase())), [contacts, friendSearch]);
  const activeTypist = currentConversation?.participants.find((participant) => participant.userId === typingUserId)?.user.name;
  const onlineCount = currentConversation?.participants.filter((participant) => participant.userId !== user.id && onlineUsers.includes(participant.userId)).length ?? 0;

  async function startConversation() {
    if (!checked.length) return;
    setSending(true); setError("");
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ participantIds: checked, title: checked.length > 1 ? groupTitle.trim() || undefined : undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not start this conversation.");
      await reloadConversations();
      setSelected(data.id); setChecked([]); setGroupTitle(""); setNewChatOpen(false); setFriendSearch("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start this conversation."); }
    finally { setSending(false); }
  }

  async function sendMessage() {
    const content = draft.trim();
    if ((!content && !attachment) || !selected || sending) return;
    setSending(true); setError("");
    try {
      const media = attachment ? await upload(attachment) : null;
      const body = { content, attachmentUrl: media?.url, attachmentKey: media?.key };
      if (socket?.connected) {
        setDraft(""); setAttachment(null);
        socket.emit("message:send", { conversationId: selected, ...body }, (ack: { ok: boolean }) => {
          if (!ack?.ok) { setDraft(content); if (attachment) setAttachment(attachment); setError("Could not send message. Please try again."); }
        });
      } else {
        const response = await fetch(`/api/conversations/${selected}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not send message.");
        setMessages((current) => [...current, data]); setDraft(""); setAttachment(null); void reloadConversations();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not send message."); }
    finally { setSending(false); }
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); }
  }

  function changeDraft(value: string) {
    setDraft(value);
    if (selected) socket?.emit("typing", { conversationId: selected, typing: value.length > 0 });
  }

  async function reactToMessage(message: Message, type: string) {
    setError("");
    const existing = message.reactions.find((reaction) => reaction.userId === user.id);
    const response = await fetch(`/api/conversations/${message.conversationId}/messages/${message.id}/reactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: existing?.type === type ? null : type }) });
    if (!response.ok) { setError("Could not update reaction."); return; }
    await loadMessages(message.conversationId);
  }

  async function saveEdit(messageId: string) {
    const response = await fetch(`/api/conversations/${selected}/messages/${messageId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: editDraft }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "Could not edit message."); return; }
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...data } : message));
    socket?.emit("message:edited", { conversationId: selected, messageId });
    setEditingId(null); setEditDraft("");
  }

  async function deleteMessage(messageId: string) {
    if (!window.confirm("Delete this message for everyone in the conversation?")) return;
    const response = await fetch(`/api/conversations/${selected}/messages/${messageId}`, { method: "DELETE" });
    if (!response.ok) { setError("Could not delete message."); return; }
    setMessages((current) => current.filter((message) => message.id !== messageId));
    socket?.emit("message:deleted", { conversationId: selected, messageId });
    void reloadConversations();
  }

  async function renameGroup() {
    if (!selected || !currentConversation || !currentConversation.isGroup) return;
    const title = window.prompt("Group name", currentConversation.title ?? "");
    if (title === null || !title.trim()) return;
    const response = await fetch(`/api/conversations/${selected}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error ?? "Could not rename group."); return; }
    await reloadConversations(); setNotice("Group name updated.");
  }

  async function addGroupPeople() {
    if (!selected || !checked.length) return;
    const response = await fetch(`/api/conversations/${selected}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds: checked }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "Could not add people."); return; }
    setChecked([]); setAddingPeople(false); await reloadConversations();
  }

  async function leaveConversation() {
    if (!selected || !window.confirm("Leave this conversation? It will disappear from your messages.")) return;
    const response = await fetch(`/api/conversations/${selected}`, { method: "DELETE" });
    if (!response.ok) { setError("Could not leave conversation."); return; }
    socket?.emit("conversation:leave", { conversationId: selected });
    setSelected(null); setToolsOpen(false); await reloadConversations();
  }

  async function loadOlder() {
    if (!selected || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try { await loadMessages(selected, nextCursor, true); }
    catch { setError("Could not load older messages."); }
    finally { setLoadingOlder(false); }
  }

  const canManageGroup = Boolean(currentConversation?.participants.some((participant) => participant.userId === user.id && ["OWNER", "ADMIN"].includes(participant.role)));
  const remainingFriends = contacts.filter((contact) => !currentConversation?.participants.some((participant) => participant.userId === contact.id));

  return <section className="relative flex h-[calc(100dvh-6.5rem)] min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Messenger">
    <aside className={`w-full shrink-0 flex-col border-r border-slate-200 md:flex md:w-[320px] lg:w-[360px] ${selected ? "hidden" : "flex"}`}>
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Gather</p><h1 className="mt-1 text-2xl font-bold">Messenger</h1></div><div className="flex items-center gap-1"><button onClick={() => { setNewChatOpen(true); setChecked([]); setError(""); }} aria-label="New message" title="New message" className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"><Plus size={20}/></button>{onClose&&<button onClick={onClose} aria-label="Close Messenger" className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100"><X size={19}/></button>}</div></div>
        <label className="mt-4 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5"><Search size={17} className="shrink-0 text-slate-400"/><input aria-label="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/>{search&&<button onClick={() => setSearch("")} aria-label="Clear search"><X size={15}/></button>}</label>
        <div className="mt-3 flex gap-2"><button onClick={() => setListMode("all")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${listMode === "all" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>All chats</button><button onClick={() => setListMode("unread")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${listMode === "unread" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>Unread{unreadTotal > 0 && <span className="ml-1">{unreadTotal}</span>}</button></div>
      </div>
      {newChatOpen&&<div className="absolute inset-0 z-20 flex flex-col bg-white md:static md:inset-auto md:z-auto md:max-h-[55%] md:border-b md:bg-slate-50">
        <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">New message</h2><p className="text-xs text-slate-500">Choose one or more friends</p></div><button onClick={() => setNewChatOpen(false)} aria-label="Close new message"><X size={18}/></button></div>
        <label className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2"><Search size={15}/><input value={friendSearch} onChange={(event) => setFriendSearch(event.target.value)} placeholder="Find a friend" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
        {checked.length > 1&&<input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={100} placeholder="Group name (optional)" className="mx-3 mt-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"/>}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{filteredContacts.map((contact) => <label key={contact.id} className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-white"><input type="checkbox" checked={checked.includes(contact.id)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} className="h-4 w-4 accent-blue-600"/><Avatar person={contact}/><span className="flex-1 truncate text-sm font-semibold">{contact.name}</span>{onlineUsers.includes(contact.id)&&<span className="text-xs text-emerald-600">Active</span>}</label>)}{!filteredContacts.length&&<p className="p-4 text-center text-sm text-slate-500">{contacts.length ? "No friends match that search." : "Add friends before starting a conversation."}</p>}</div>
        <div className="border-t p-3"><button disabled={!checked.length||sending} onClick={() => void startConversation()} className={`${button} w-full`}>{sending?<LoaderCircle size={16} className="animate-spin"/>:<MessageCircle size={16}/>} {checked.length > 1 ? "Create group conversation" : "Start conversation"}</button></div>
      </div>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading&&<p className="p-5 text-center text-sm text-slate-500">Loading messages…</p>}
        {!loading&&filteredConversations.map((conversation) => {
          const unread = getUnread(conversation, user.id); const latest = conversation.messages[0];
          const other = conversation.participants.find((participant) => participant.userId !== user.id)?.user ?? user;
          return <button key={conversation.id} onClick={() => { setSelected(conversation.id); setNewChatOpen(false); setNotice(""); }} className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${selected === conversation.id ? "bg-blue-50" : ""}`}>
            <span className="relative">{conversation.isGroup ? <span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-100 text-indigo-700"><Users size={20}/></span> : <Avatar person={other} online={onlineUsers.includes(other.id)}/>}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><b className={`truncate text-sm ${unread ? "text-slate-950" : "text-slate-700"}`}>{conversationName(conversation, user.id)}</b>{latest&&<time className="shrink-0 text-[10px] text-slate-400">{new Date(latest.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</time>}</span><span className="mt-1 flex items-center gap-1"><span className={`truncate text-xs ${unread ? "font-semibold text-slate-700" : "text-slate-500"}`}>{latest ? `${latest.sender.id === user.id ? "You: " : ""}${latest.content || (latest.attachmentUrl ? "Shared an attachment" : "New message")}` : "Start chatting"}</span>{unread&&<span className="h-2 w-2 shrink-0 rounded-full bg-blue-600"/>}</span></span>
          </button>;
        })}
        {!loading&&!filteredConversations.length&&<div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-700"><MessageCircle/></span><p className="mt-4 font-semibold">{listMode === "unread" ? "No unread messages" : "Your messages start here"}</p><p className="mt-1 text-sm text-slate-500">Start a private conversation with a friend.</p><button onClick={() => setNewChatOpen(true)} className="mt-4 text-sm font-bold text-blue-700">Write a message</button></div>}
      </div>
      <div className="flex items-center gap-3 border-t p-3"><Avatar person={user}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name}</p><p className="text-xs text-emerald-600">Messenger</p></div><button onClick={() => void reloadConversations(true)} aria-label="Refresh conversations" title="Refresh conversations" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><ChevronDown size={17}/></button></div>
    </aside>

    <div className={`min-w-0 flex-1 flex-col ${selected ? "flex" : "hidden md:flex"}`}>
      {currentConversation ? <>
        <header className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-5">
          <button onClick={() => setSelected(null)} aria-label="Back to conversations" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-slate-100 md:hidden"><ArrowLeft size={19}/></button>
          {currentConversation.isGroup ? <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-700"><Users size={20}/></span> : <Avatar person={currentConversation.participants.find((participant) => participant.userId !== user.id)?.user ?? user} online={onlineCount > 0}/>}
          <div className="min-w-0 flex-1"><h2 className="truncate font-bold">{conversationName(currentConversation, user.id)}</h2><p className="truncate text-xs text-slate-500">{activeTypist ? `${activeTypist} is typing…` : onlineCount ? `${onlineCount} active now` : currentConversation.isGroup ? `${currentConversation.participants.length} people` : "Private conversation"}</p></div>
          <button onClick={() => setToolsOpen(true)} aria-label="Conversation details" title="Conversation details" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"><Settings2 size={18}/></button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-slate-50/70 px-3 py-4 sm:px-6">
          {nextCursor&&<div className="mb-4 text-center"><button onClick={() => void loadOlder()} disabled={loadingOlder} className={softButton}>{loadingOlder&&<LoaderCircle size={15} className="animate-spin"/>}Load earlier messages</button></div>}
          {!messages.length&&<div className="grid h-full min-h-56 place-items-center text-center"><div><Avatar person={currentConversation.isGroup ? user : currentConversation.participants.find((participant) => participant.userId !== user.id)?.user ?? user} size="lg"/><h3 className="mt-3 font-bold">Say hello to {conversationName(currentConversation, user.id)}</h3><p className="mt-1 text-sm text-slate-500">Your messages are visible to people in this conversation.</p></div></div>}
          <div className="space-y-4">
            {messages.map((message, index) => {
              const mine = message.sender.id === user.id;
              const previous = messages[index - 1];
              const showSender = currentConversation.isGroup && !mine && previous?.sender.id !== message.sender.id;
              const grouped = previous?.sender.id === message.sender.id && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
              const isSeen = mine && currentConversation.participants.some((participant) => participant.userId !== user.id && participant.lastReadAt && new Date(participant.lastReadAt) >= new Date(message.createdAt));
              const reactionSummary = reactionChoices.map((choice) => ({ ...choice, count: message.reactions.filter((reaction) => reaction.type === choice.type).length, mine: message.reactions.some((reaction) => reaction.userId === user.id && reaction.type === choice.type) })).filter((item) => item.count);
              return <div key={message.id} className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine&&<span className="w-8 shrink-0">{!grouped&&<Avatar person={message.sender} size="sm"/>}</span>}
                <div className={`max-w-[min(82%,600px)] ${mine ? "items-end" : "items-start"}`}>
                  {showSender&&<p className="mb-1 ml-3 text-xs font-semibold text-slate-500">{message.sender.name}</p>}
                  {editingId === message.id ? <div className="min-w-[220px] rounded-2xl border border-blue-200 bg-white p-2 shadow-sm"><textarea autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={10000} className="w-full resize-y rounded-lg p-2 text-sm outline-none"/><div className="flex justify-end gap-2"><button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-slate-500">Cancel</button><button onClick={() => void saveEdit(message.id)} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white">Save</button></div></div> : <div className={`relative rounded-2xl px-4 py-2.5 ${mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-white shadow-sm ring-1 ring-slate-100"}`}>
                    {message.content&&<p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>}
                    <MessageAttachment message={message}/>
                    <div className={`mt-1 flex items-center gap-1.5 text-[10px] ${mine ? "justify-end text-blue-100" : "text-slate-400"}`}><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>{message.editedAt&&<span>· edited</span>}{mine&&(isSeen?<span title="Seen"><CheckCheck size={13}/></span>:<span title="Sent"><Check size={12}/></span>)}</div>
                  </div>}
                  {(reactionSummary.length > 0 || mine)&&<div className={`mt-1 flex flex-wrap items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                    {reactionSummary.map((reaction) => <button key={reaction.type} onClick={() => void reactToMessage(message, reaction.type)} title={`${reaction.label}${reaction.mine ? " · remove reaction" : ""}`} className={`rounded-full border px-2 py-0.5 text-xs ${reaction.mine ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>{reaction.emoji} {reaction.count}</button>)}
                  </div>}
                  <div className={`mt-1 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 ${mine ? "justify-end" : "justify-start"}`}>
                    <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">{reactionChoices.map((choice) => <button key={choice.type} onClick={() => void reactToMessage(message, choice.type)} aria-label={`${choice.label} message`} title={choice.label} className={`rounded-full px-1.5 py-1 text-xs hover:bg-slate-100 ${message.reactions.some((reaction) => reaction.userId === user.id && reaction.type === choice.type) ? "bg-blue-50" : ""}`}>{choice.emoji}</button>)}</div>
                    {mine&&<><button onClick={() => { setEditingId(message.id); setEditDraft(message.content); }} aria-label="Edit message" title="Edit message" className="grid h-7 w-7 place-items-center rounded-full bg-white text-slate-500 shadow-sm hover:text-blue-700"><Pencil size={13}/></button><button onClick={() => void deleteMessage(message.id)} aria-label="Delete message" title="Delete message" className="grid h-7 w-7 place-items-center rounded-full bg-white text-slate-500 shadow-sm hover:text-red-600"><Trash2 size={13}/></button></>}
                  </div>
                </div>
              </div>;
            })}
            <div ref={tailRef}/>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white p-3 sm:px-5 sm:py-4">
          {attachment&&<div className="mb-3 flex items-center gap-3 rounded-xl bg-blue-50 p-2.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-blue-700">{attachment.type.startsWith("video/")?<Video size={18}/>:<ImagePlus size={18}/>}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{attachment.name} <span className="text-xs text-slate-500">· {(attachment.size / (1024 * 1024)).toFixed(1)} MB</span></span><button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="grid h-8 w-8 place-items-center rounded-full hover:bg-blue-100"><X size={16}/></button></div>}
          <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="flex items-end gap-2">
            <label title="Attach an image or video" className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"><FilePlus2 size={18}/><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="sr-only" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 100 * 1024 * 1024) setError("Attachments must be 100 MB or smaller."); else { setAttachment(file); setError(""); } event.target.value = ""; }}/></label>
            <div className="flex min-w-0 flex-1 items-end rounded-2xl bg-slate-100 pr-1.5"><textarea value={draft} onChange={(event) => changeDraft(event.target.value)} onKeyDown={composerKeyDown} maxLength={10000} rows={1} placeholder="Write a message… (Enter to send)" aria-label="Write a message" className="max-h-36 min-h-10 flex-1 resize-y bg-transparent px-4 py-3 text-sm outline-none"/><button type="button" onClick={() => setDraft((value) => `${value}${value ? " " : ""}😊`)} aria-label="Add a smile emoji" title="Add emoji" className="mb-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white"><Smile size={18}/></button></div>
            <button disabled={sending||(!draft.trim()&&!attachment)} aria-label="Send message" title="Send message" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300">{sending?<LoaderCircle size={17} className="animate-spin"/>:<Send size={17}/>}</button>
          </form>
          <p className="mt-2 min-h-4 text-xs text-slate-400">{activeTypist ? `${activeTypist} is typing…` : "Enter to send · Shift + Enter for a new line"}</p>
        </div>
      </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-700"><MessageCircle size={30}/></span><h2 className="mt-5 text-xl font-bold">Your people are one message away</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">Chat one-on-one or make a group, share photos and videos, and keep the conversation going in real time.</p><button onClick={() => setNewChatOpen(true)} className={`${button} mt-5`}><Plus size={16}/> New message</button></div></div>}
    </div>

    {error&&<div role="alert" className="absolute bottom-20 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16}/></button></div>}
    {notice&&<div role="status" className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{notice}</div>}

    {toolsOpen&&currentConversation&&<div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/40 p-3" role="dialog" aria-modal="true" aria-label="Conversation details"><section className="max-h-[85%] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><header className="flex items-center justify-between"><h2 className="text-lg font-bold">Conversation details</h2><button onClick={() => { setToolsOpen(false); setAddingPeople(false); }} aria-label="Close conversation details" className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100"><X size={18}/></button></header><div className="mt-5 flex flex-col items-center text-center">{currentConversation.isGroup?<span className="grid h-16 w-16 place-items-center rounded-full bg-indigo-100 text-indigo-700"><Users size={28}/></span>:<Avatar person={currentConversation.participants.find((participant) => participant.userId !== user.id)?.user ?? user} size="lg"/>}<h3 className="mt-3 font-bold">{conversationName(currentConversation, user.id)}</h3><p className="text-sm text-slate-500">{currentConversation.participants.length} participant{currentConversation.participants.length === 1 ? "" : "s"}</p></div><div className="mt-5 space-y-2">{currentConversation.participants.map((participant) => <div key={participant.userId} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2"><Avatar person={participant.user}/><span className="min-w-0 flex-1 truncate text-sm font-semibold">{participant.user.name}{participant.userId === user.id ? " (you)" : ""}</span><span className="text-xs text-slate-500">{participant.role.toLowerCase()}</span><span className={`h-2.5 w-2.5 rounded-full ${onlineUsers.includes(participant.userId) ? "bg-emerald-500" : "bg-slate-300"}`} title={onlineUsers.includes(participant.userId) ? "Active" : "Offline"}/></div>)}</div>
        {currentConversation.isGroup&&<div className="mt-5 grid gap-2 sm:grid-cols-2">{canManageGroup&&<button onClick={() => void renameGroup()} className={softButton}><Pencil size={15}/> Rename group</button>}{canManageGroup&&<button onClick={() => { setChecked([]); setAddingPeople((value) => !value); }} className={softButton}><UserPlus size={15}/> Add people</button>}<button onClick={() => void leaveConversation()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><ArrowLeft size={15}/> Leave group</button></div>}
        {!currentConversation.isGroup&&<button onClick={() => void leaveConversation()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={15}/> Remove conversation</button>}
        {addingPeople&&<div className="mt-4 rounded-xl border border-slate-200 p-3"><p className="mb-2 text-sm font-bold">Add friends</p><div className="max-h-40 space-y-1 overflow-y-auto">{remainingFriends.map((contact) => <label key={contact.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" checked={checked.includes(contact.id)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))}/><Avatar person={contact} size="sm"/><span className="text-sm">{contact.name}</span></label>)}{!remainingFriends.length&&<p className="py-2 text-sm text-slate-500">All your friends are already here.</p>}</div><button disabled={!checked.length} onClick={() => void addGroupPeople()} className={`${button} mt-3 w-full`}><UserPlus size={15}/> Add selected</button></div>}
        <p className="mt-4 text-center text-xs text-slate-400">Messages are visible to members of this conversation.</p>
      </section></div>}
  </section>;
}
