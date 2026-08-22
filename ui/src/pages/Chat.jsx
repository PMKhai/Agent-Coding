import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import MarkdownContent from "../components/MarkdownContent";
import FileEditCard from "../components/FileEditCard";
import LiveFilePanel from "../components/LiveFilePanel";
import RecallPanel from "../components/RecallPanel";
import { toast } from "sonner";
import { dialog } from "../components/Dialog";

const ROLE_STYLES = {
  // Subtle 5% black-tint bubble (cofounder pattern) instead of bright accent —
  // less visual noise when scanning long threads.
  user: "bg-co-fg/[0.06] text-co-fg border border-co-fg/[0.06]",
  assistant: "bg-co-surface text-co-fg border border-co-fg/10",
};

function friendlyToolLabel(name, input = {}) {
  if (!name) return "Working...";
  if (name === "Task")
    return `Delegating to ${input.subagent_type || "sub-agent"}`;
  if (name === "ToolSearch") return "Looking up tools";
  if (name === "Read") {
    const f = input.file_path || "";
    return f ? `Reading ${f.split("/").pop()}` : "Reading file";
  }
  if (name === "Write") return "Writing file";
  if (name === "Edit") return "Editing file";
  if (name === "Bash") return "Running command";
  if (name === "Grep") return "Searching code";
  if (name === "Glob") return "Finding files";
  if (name === "WebFetch" || name === "WebSearch") return "Searching the web";
  if (name === "TodoWrite") return "Updating task list";
  // MCP tools — strip prefixes for readability
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    const action = parts[parts.length - 1].replace(/_/g, " ");
    const server = parts[1]?.replace(/_/g, " ");
    return `${server}: ${action}`;
  }
  return name;
}

function MentionRow({ item, selected, onPick, onHover, scrollRef }) {
  const ref = useRef(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const isFolder = item.kind === "folder";
  return (
    <button
      ref={ref}
      type="button"
      onMouseEnter={onHover}
      onClick={onPick}
      className={`w-full text-left px-3 py-2 border-b border-co-fg/10 last:border-0 flex items-center gap-2 transition-colors ${
        selected ? "bg-co-fg/[0.08]" : "hover:bg-co-fg/[0.05]"
      }`}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-co-sm"
        style={{
          background: isFolder
            ? "linear-gradient(135deg, #f59e0b33, #f59e0b14)"
            : "linear-gradient(135deg, #6366f133, #6366f114)",
          color: isFolder ? "#d97706" : "#6366f1",
        }}
      >
        {isFolder ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <circle cx="9" cy="12" r="1" fill="currentColor" />
            <circle cx="15" cy="12" r="1" fill="currentColor" />
            <path d="M8 6V4M16 6V4" opacity="0.6" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-co-fg">
          @{isFolder ? item.data.name : item.data.name || item.data.filename}
        </div>
        {isFolder ? (
          <div className="text-xs text-co-fg/50 truncate">
            {item.data.repoPath}
          </div>
        ) : (
          item.data.description && (
            <div className="text-xs text-co-fg/50 line-clamp-1">
              {item.data.description}
            </div>
          )
        )}
      </div>
    </button>
  );
}

function MentionPopup({ items, selectedIndex, onPick, onHover }) {
  if (items.length === 0) return null;
  const folders = items.filter((i) => i.kind === "folder");
  const agents = items.filter((i) => i.kind === "agent");
  let counter = 0;
  return (
    <div className="absolute z-30 bottom-full mb-2 left-0 w-96 max-h-72 overflow-y-auto bg-co-surface border border-co-fg/10 rounded-lg shadow-xl">
      {folders.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-co-fg/50 bg-co-bg border-b border-co-fg/10">
            Folders
          </div>
          {folders.map((item) => {
            const i = counter++;
            return (
              <MentionRow
                key={"f" + item.data.name}
                item={item}
                selected={i === selectedIndex}
                onPick={() => onPick(item)}
                onHover={() => onHover(i)}
              />
            );
          })}
        </>
      )}
      {agents.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-co-fg/50 bg-co-bg border-b border-co-fg/10">
            Agents
          </div>
          {agents.map((item) => {
            const i = counter++;
            return (
              <MentionRow
                key={"a" + (item.data.filename || item.data.name)}
                item={item}
                selected={i === selectedIndex}
                onPick={() => onPick(item)}
                onHover={() => onHover(i)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function MessageBlock({ msg }) {
  return (
    <div
      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-4`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${ROLE_STYLES[msg.role]} shadow-sm`}
      >
        {msg.content &&
          (msg.role === "assistant" ? (
            <MarkdownContent content={msg.content} />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {msg.content}
            </pre>
          ))}
        {msg.attachments?.length > 0 && (
          <div
            className={`flex flex-wrap gap-1.5 ${msg.content ? "mt-2" : ""}`}
          >
            {msg.attachments.map((a, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-mono ${
                  msg.role === "user"
                    ? "bg-white/20 text-white"
                    : "bg-co-fg/[0.05] text-co-fg/70"
                }`}
                title={a.path}
              >
                {a.contentType?.startsWith("image/") ? (
                  <svg
                    className="inline -mt-0.5"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                ) : (
                  <svg
                    className="inline -mt-0.5"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}{" "}
                {a.filename}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const FILE_EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

function StreamingBubble({ toolEvents, streamText }) {
  const [showDetails, setShowDetails] = useState(false);
  const fileEdits = toolEvents.filter((t) => FILE_EDIT_TOOLS.has(t.name));
  const otherEvents = toolEvents.filter((t) => !FILE_EDIT_TOOLS.has(t.name));
  const latest = toolEvents[toolEvents.length - 1]?.label;
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-co-surface text-co-fg border border-co-fg/10/60 shadow-sm">
        {otherEvents.length > 0 && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowDetails((s) => !s)}
              className="flex items-center gap-2 text-xs text-co-fg/50 hover:text-co-fg transition-colors"
            >
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 bg-co-fg/60 rounded-full animate-pulse" />
                <span
                  className="w-1 h-1 bg-co-fg/60 rounded-full animate-pulse"
                  style={{ animationDelay: "200ms" }}
                />
                <span
                  className="w-1 h-1 bg-co-fg/60 rounded-full animate-pulse"
                  style={{ animationDelay: "400ms" }}
                />
              </span>
              <span>{latest || "Working"}</span>
              <span className="text-co-fg/50">
                · {otherEvents.length} step
                {otherEvents.length === 1 ? "" : "s"}
              </span>
              <svg
                className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showDetails && (
              <div className="mt-1.5 pl-3 border-l-2 border-co-fg/20 space-y-0.5">
                {otherEvents.map((t, i) => (
                  <div key={i} className="text-xs text-co-fg/50">
                    {t.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {fileEdits.length > 0 && (
          <div className="mb-2 -mx-1.5">
            {fileEdits.map((t, i) => (
              <FileEditCard key={i} tool={t.name} input={t.input} />
            ))}
          </div>
        )}
        {streamText ? (
          <MarkdownContent content={streamText} />
        ) : (
          <div className="flex items-center gap-1 py-1">
            <span
              className="w-1.5 h-1.5 bg-co-fg/40 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-1.5 h-1.5 bg-co-fg/40 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-1.5 h-1.5 bg-co-fg/40 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const slugToId = (s) => {
  if (!s) return null;
  if (s.startsWith("claude-opus")) return "opus";
  if (s.startsWith("claude-sonnet")) return "sonnet";
  if (s.startsWith("claude-haiku")) return "haiku";
  return s; // already an id like "opus"
};

export default function Chat() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [agents, setAgents] = useState([]);
  const [repos, setRepos] = useState([]);
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolEvents, setToolEvents] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [recallQuery, setRecallQuery] = useState(null);
  const [recallFile, setRecallFile] = useState(null);
  const [attachments, setAttachments] = useState([]); // [{path, filename, size, contentType, uploading}]
  const [dragActive, setDragActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  // fileEdits accumulates Edit/Write/MultiEdit events for the active chat —
  // outlives a single proc so the LiveFilePanel keeps showing recent files
  // even after streaming ends. Cleared only when switching to a different chat.
  const [fileEdits, setFileEdits] = useState([]);
  const [livePanelOpen, setLivePanelOpen] = useState(false);

  useEffect(() => {
    refreshChats();
    api
      .getAgents()
      .then(setAgents)
      .catch(() => {});
    api
      .getRepositories()
      .then(setRepos)
      .catch(() => {});
    api
      .getModels()
      .then((list) =>
        setModels(list.map((m) => ({ id: m.id, label: m.label }))),
      )
      .catch(() => setModels([]));
    api
      .getSettings()
      .then((s) => setDefaultModel(slugToId(s.model) || "sonnet"))
      .catch(() => setDefaultModel("sonnet"));
  }, []);

  async function refreshChats() {
    try {
      const list = await api.getChats("chat");
      setChats(list);
      if (!activeId && list.length > 0) selectChat(list[0].id);
    } catch {}
  }

  async function selectChat(id) {
    // If we were subscribed to a different chat, drop that subscription so
    // its deltas don't leak into the new view.
    const prevId = activeId;
    if (prevId && prevId !== id && wsRef.current?.readyState === 1) {
      wsRef.current.send(
        JSON.stringify({ action: "chat-unsubscribe", chatId: prevId }),
      );
    }
    setActiveId(id);
    setStreamText("");
    setToolEvents([]);
    setStreaming(false);
    setFileEdits([]);
    try {
      const chat = await api.getChat(id);
      setActiveChat(chat);
    } catch {}
    // Subscribe — server replies chat-resume (with snapshot) if a proc is
    // still running for this chat, or chat-not-running if idle.
    const ws = connect();
    const subscribe = () =>
      ws.send(JSON.stringify({ action: "chat-subscribe", chatId: id }));
    if (ws.readyState === 1) subscribe();
    else ws.addEventListener("open", subscribe, { once: true });
  }

  async function newChat() {
    const c = await api.createChat();
    setChats((prev) => [c, ...prev]);
    selectChat(c.id);
  }

  async function deleteChat(id, e) {
    e.stopPropagation();
    if (
      !(await dialog.confirm({
        message: "Delete this chat?",
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    await api.deleteChat(id);
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setActiveChat(null);
    }
  }

  async function renameChatPrompt(id, e) {
    e.stopPropagation();
    const current = chats.find((c) => c.id === id);
    const next = await dialog.prompt({
      title: "Rename chat",
      defaultValue: current?.title || "",
      placeholder: "Thread title",
      confirmLabel: "Rename",
    });
    if (!next?.trim()) return;
    await api.renameChat(id, next.trim());
    refreshChats();
    if (activeId === id) selectChat(id);
  }

  async function setChatModel(modelId) {
    if (!activeChat) return;
    setModelMenuOpen(false);
    const updated = await api.updateChat(activeChat.id, { model: modelId });
    setActiveChat(updated);
  }

  async function togglePlanMode() {
    if (!activeChat) return;
    const updated = await api.updateChat(activeChat.id, {
      planMode: !activeChat.planMode,
    });
    setActiveChat(updated);
  }

  async function addFolder(repo) {
    if (!activeChat) return;
    const current = activeChat.folderPaths || [];
    if (current.includes(repo.repoPath)) return;
    const next = [...current, repo.repoPath];
    const updated = await api.updateChat(activeChat.id, { folderPaths: next });
    setActiveChat(updated);
  }

  async function removeFolder(folderPath) {
    if (!activeChat) return;
    const next = (activeChat.folderPaths || []).filter((p) => p !== folderPath);
    const updated = await api.updateChat(activeChat.id, { folderPaths: next });
    setActiveChat(updated);
  }

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === 1) return wsRef.current;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;

    const sidebarBump = (chat) => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: (chat.messages || []).length,
    });

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "chat-user-saved") {
        setActiveChat(msg.chat);
        setChats((prev) => [
          sidebarBump(msg.chat),
          ...prev.filter((c) => c.id !== msg.chat.id),
        ]);
      } else if (msg.type === "chat-resume") {
        // Server says this chat has a running proc — replay snapshot, then
        // future chat-delta/chat-tool events stream in live.
        setStreaming(true);
        setStreamText(msg.assistantText || "");
        const tools = (msg.toolEvents || []).map((t) => ({
          name: t.name,
          input: t.input || {},
          label: friendlyToolLabel(t.name, t.input),
        }));
        setToolEvents(tools);
        setFileEdits(
          tools.filter((t) => ["Edit", "Write", "MultiEdit"].includes(t.name)),
        );
      } else if (msg.type === "chat-not-running") {
        // No active proc for this chat — make sure UI shows idle.
        setStreaming(false);
        setStreamText("");
        setToolEvents([]);
      } else if (msg.type === "chat-delta") {
        setStreamText((prev) => prev + msg.text);
      } else if (msg.type === "chat-tool") {
        const evt = {
          name: msg.name,
          input: msg.input || {},
          label: friendlyToolLabel(msg.name, msg.input),
        };
        setToolEvents((prev) => [...prev, evt]);
        if (["Edit", "Write", "MultiEdit"].includes(msg.name)) {
          setFileEdits((prev) => [...prev, evt]);
          setLivePanelOpen(true);
        }
      } else if (msg.type === "chat-done") {
        setStreaming(false);
        setStreamText("");
        setToolEvents([]);
        setActiveChat(msg.chat);
        setChats((prev) => [
          sidebarBump(msg.chat),
          ...prev.filter((c) => c.id !== msg.chat.id),
        ]);
      } else if (msg.type === "chat-stopped") {
        setStreaming(false);
      } else if (msg.type === "chat-error") {
        setStreaming(false);
        setStreamText((prev) => prev + `\n[Error] ${msg.error}`);
      } else if (msg.type === "chat-stderr") {
        setToolEvents((prev) => [...prev, { kind: "err", label: msg.data }]);
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    ws.onerror = () => {
      setStreaming(false);
    };
    return ws;
  }, []);

  // Only auto-scroll when the user is already near the bottom. If they've
  // scrolled up to read history, leave their position alone — toggling back
  // to bottom is via the floating "Jump to bottom" button.
  useEffect(() => {
    if (pinnedToBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChat?.messages, streamText, toolEvents, pinnedToBottom]);

  // Track whether the user is near the bottom of the messages list.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinnedToBottom(distanceFromBottom < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeId]);

  // When user sends a new message, snap back to bottom regardless.
  function jumpToBottom() {
    setPinnedToBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  function send() {
    if ((!input.trim() && attachments.length === 0) || streaming || !activeId)
      return;
    if (attachments.some((a) => a.uploading)) return;

    // Don't submit /recall commands, just keep panel visible
    if (input.match(/^\/recall\s+/)) {
      setInput("");
      return;
    }

    const ws = connect();
    const message =
      input.trim() ||
      (attachments[0]?.filename
        ? `Attached: ${attachments.map((a) => a.filename).join(", ")}`
        : "");
    const sentAttachments = attachments
      .filter((a) => a.path)
      .map((a) => ({
        path: a.path,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      }));
    setInput("");
    setAttachments([]);
    setStreaming(true);
    setStreamText("");
    setToolEvents([]);
    setPinnedToBottom(true);
    const dispatch = () =>
      ws.send(
        JSON.stringify({
          action: "chat-send",
          chatId: activeId,
          message,
          ...(sentAttachments.length > 0
            ? { attachments: sentAttachments }
            : {}),
        }),
      );
    if (ws.readyState === 1) dispatch();
    else ws.addEventListener("open", dispatch, { once: true });
  }

  async function uploadFiles(files) {
    const items = Array.from(files).slice(0, 10);
    const placeholders = items.map((f) => ({
      filename: f.name,
      size: f.size,
      contentType: f.type,
      uploading: true,
      _localId: Math.random(),
    }));
    setAttachments((prev) => [...prev, ...placeholders]);
    for (let i = 0; i < items.length; i++) {
      const file = items[i];
      const placeholder = placeholders[i];
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const resp = await api.uploadAttachment({
          filename: file.name,
          data: dataUrl,
          contentType: file.type,
        });
        setAttachments((prev) =>
          prev.map((a) =>
            a._localId === placeholder._localId
              ? {
                  path: resp.path,
                  filename: resp.filename,
                  size: resp.size,
                  contentType: resp.contentType,
                  uploading: false,
                  _localId: a._localId,
                }
              : a,
          ),
        );
      } catch (err) {
        setAttachments((prev) =>
          prev.filter((a) => a._localId !== placeholder._localId),
        );
        toast.error(`Upload failed for ${file.name}: ${err.message}`);
      }
    }
  }

  function removeAttachment(localId) {
    setAttachments((prev) => prev.filter((a) => a._localId !== localId));
  }

  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    if (!activeId) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) uploadFiles(files);
  }

  function onPaste(e) {
    if (!activeId) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      uploadFiles(files);
    }
  }

  function stop() {
    if (wsRef.current?.readyState === 1 && activeId) {
      wsRef.current.send(
        JSON.stringify({ action: "chat-stop", chatId: activeId }),
      );
    }
  }

  const mentionItems = (() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const folders = repos
      .filter((r) => r.name.toLowerCase().includes(q))
      .map((r) => ({ kind: "folder", data: r }));
    const ags = agents
      .filter((a) => (a.name || a.filename || "").toLowerCase().includes(q))
      .map((a) => ({ kind: "agent", data: a }));
    return [...folders, ...ags];
  })();

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  function onInputChange(e) {
    const v = e.target.value;
    setInput(v);
    const cursor = e.target.selectionStart;
    const before = v.slice(0, cursor);

    // Check for /recall command
    const recallMatch = v.match(/^\/recall\s+(.+)$/);
    if (recallMatch) {
      setRecallQuery(recallMatch[1]);
      setMentionQuery(null);
      setRecallFile(null);
    } else {
      setRecallQuery(null);

      // Check for @mention
      const m = before.match(/@([\w-]*)$/);
      if (m) {
        setMentionQuery(m[1]);
        // Try to resolve file path for auto-mode recall
        const query = m[1];
        if (query && query.includes(".")) {
          // Looks like a file mention
          const file = repos
            .flatMap((r) => r.files || [])
            .find((f) => f.path.endsWith("/" + query) || f.filename === query);
          setRecallFile(file ? file.path : null);
        } else {
          setRecallFile(null);
        }
      } else {
        setMentionQuery(null);
        setRecallFile(null);
      }
    }
  }

  function pickMentionItem(item) {
    if (item.kind === "folder") pickFolder(item.data);
    else pickAgent(item.data);
  }

  function pickAgent(agent) {
    const name = agent.name || agent.filename;
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursor).replace(/@([\w-]*)$/, `@${name} `);
    const after = input.slice(cursor);
    setInput(before + after);
    setMentionQuery(null);
    setTimeout(() => {
      inputRef.current?.focus();
      const pos = before.length;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function pickFolder(repo) {
    addFolder(repo);
    // Strip the @query from the input — folder is attached as a pill instead
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursor).replace(/@([\w-]*)$/, "");
    const after = input.slice(cursor);
    setInput(before + after);
    setMentionQuery(null);
    setTimeout(() => {
      inputRef.current?.focus();
      const pos = before.length;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function onKeyDown(e) {
    if (mentionQuery !== null && mentionItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (i) => (i - 1 + mentionItems.length) % mentionItems.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMentionItem(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
      e.preventDefault();
      send();
    }
  }

  const messages = activeChat?.messages || [];
  const currentModel = activeChat?.model || defaultModel || "sonnet";
  const folderPaths = activeChat?.folderPaths || [];
  const folderPills = folderPaths.map((p) => {
    const repo = repos.find((r) => r.repoPath === p);
    return { path: p, name: repo?.name || p.split("/").pop() };
  });

  return (
    <div className="cofounder-skin h-full flex bg-co-bg text-co-fg">
      {/* Sidebar — chat list */}
      <aside
        className={`${sidebarOpen ? "w-72" : "w-0"} transition-all overflow-hidden border-r border-co-fg/10 flex flex-col bg-co-surface`}
      >
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-co-fg/40">
            <span className="h-px w-5 bg-co-fg/15" />
            Threads
          </div>
          <button
            onClick={newChat}
            className="group flex w-full items-center justify-center gap-2 rounded-co bg-co-primary px-3 py-2.5 text-sm font-semibold text-co-primary-fg shadow-[0_4px_14px_-6px_rgba(0,0,0,0.25)] transition-all hover:opacity-95 hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-hover:rotate-90"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {chats.length === 0 && (
            <div className="relative mt-2 overflow-hidden rounded-co border border-dashed border-co-fg/15 px-4 py-8 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-12 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
                }}
              />
              <div className="relative mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-co bg-co-bg ring-1 ring-co-fg/[0.08]">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-co-fg/50"
                >
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />
                </svg>
              </div>
              <p className="relative text-xs font-medium text-co-fg/70">
                No threads yet
              </p>
              <p className="relative mt-0.5 text-[10px] text-co-fg/40">
                Click{" "}
                <span className="font-semibold text-co-fg/60">New chat</span> to
                start
              </p>
            </div>
          )}
          {chats.map((c) => (
            <div
              key={c.id}
              onClick={() => selectChat(c.id)}
              className={`group cursor-pointer px-3 py-2 rounded-lg transition-colors ${
                activeId === c.id
                  ? "bg-co-fg/[0.08] text-co-fg"
                  : "hover:bg-co-fg/[0.05] text-co-fg/70"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-co-fg/50">
                    {c.messageCount || 0} msgs
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={(e) => renameChatPrompt(c.id, e)}
                    className="p-1 text-co-fg/50 hover:text-co-fg"
                    title="Rename"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => deleteChat(c.id, e)}
                    className="p-1 text-co-fg/50 hover:text-co-destructive"
                    title="Delete"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <main
        className={`flex-1 flex flex-col overflow-hidden relative ${dragActive ? "ring-2 ring-co-fg/30 ring-inset" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("Files") && activeId)
            setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (e.target === e.currentTarget) setDragActive(false);
        }}
        onDrop={onDrop}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-co-fg/10 bg-co-surface/80 px-5 py-3 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-co-sm text-co-fg/50 transition-colors hover:bg-co-fg/[0.06] hover:text-co-fg"
            title="Toggle sidebar"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
          {/* Robot avatar — subtle gradient ring with status pulse */}
          <div className="relative shrink-0" aria-hidden>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-co-fg/70"
              style={{
                background:
                  "linear-gradient(135deg, rgb(var(--co-fg-rgb) / 0.06), rgb(var(--co-fg-rgb) / 0.02))",
                boxShadow: "inset 0 0 0 1px rgb(var(--co-fg-rgb) / 0.08)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Head */}
                <rect x="5" y="8" width="14" height="10" rx="3" />
                {/* Antenna */}
                <path d="M12 5v3" />
                <circle
                  cx="12"
                  cy="4"
                  r="0.9"
                  fill="currentColor"
                  stroke="none"
                />
                {/* Eyes */}
                <circle
                  cx="9.2"
                  cy="13"
                  r="0.9"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="14.8"
                  cy="13"
                  r="0.9"
                  fill="currentColor"
                  stroke="none"
                />
                {/* Side ears */}
                <path d="M3.5 12v2M20.5 12v2" opacity="0.55" />
              </svg>
            </div>
            {/* Tiny status dot */}
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-co-surface"
              style={{
                background: streaming
                  ? "rgb(var(--co-accent-rgb))"
                  : "rgb(var(--co-success-rgb))",
                boxShadow: streaming
                  ? "0 0 6px rgb(var(--co-accent-rgb) / 0.8)"
                  : "0 0 4px rgb(var(--co-success-rgb) / 0.7)",
                animation: streaming
                  ? "pulse 1.2s ease-in-out infinite"
                  : "none",
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-co-fg">
              {activeChat?.title || "Chat with orchestrator"}
            </h1>
            <p className="mt-0.5 text-[11px] text-co-fg/45">
              Type{" "}
              <code className="rounded bg-co-fg/[0.06] px-1 font-mono text-co-fg/65">
                @
              </code>{" "}
              to mention an agent or folder
            </p>
          </div>

          {/* Context size progress bar — fills L→R, color shifts at 50% / 70% / 90% */}
          {activeChat &&
            (() => {
              const used = activeChat.lastContextTokens || 0;
              const pct = Math.min(100, Math.round((used / 200_000) * 100));
              // Color thresholds: cool (low) → accent → amber → red
              const color =
                pct >= 90
                  ? "#ef4444"
                  : pct >= 70
                    ? "#f97316"
                    : pct >= 50
                      ? "#f59e0b"
                      : pct >= 25
                        ? "rgb(var(--co-accent-rgb))"
                        : "rgb(var(--co-success-rgb))";
              return (
                <div
                  title={`Context: ${used.toLocaleString()} / 200,000 tokens · ${pct}%. Auto-compacts at 70%.`}
                  className="flex w-24 shrink-0 flex-col gap-1"
                >
                  <div className="flex items-center justify-between text-[9px] font-medium uppercase tracking-wider text-co-fg/45">
                    <span>ctx</span>
                    <span
                      className="font-mono tabular-nums transition-colors duration-500"
                      style={{ color }}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-co-fg/[0.06]">
                    {/* Threshold tick at 70% (auto-compact line) */}
                    <span
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-co-fg/15"
                      style={{ left: "70%" }}
                    />
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: `linear-gradient(90deg, ${color}aa, ${color})`,
                        boxShadow: `0 0 8px ${color}99`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}

          {/* Files toggle — icon-only chip */}
          {activeChat && (
            <button
              onClick={() => setLivePanelOpen((v) => !v)}
              title={
                fileEdits.length === 0
                  ? "Files the agent edits will appear here"
                  : `${fileEdits.length} file edit${fileEdits.length === 1 ? "" : "s"} so far`
              }
              className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                livePanelOpen
                  ? "border-co-success/40 bg-co-success/15 text-co-success"
                  : "border-co-fg/15 text-co-fg/60 hover:border-co-fg/30 hover:text-co-fg"
              }`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {fileEdits.length > 0 ? fileEdits.length : "Files"}
            </button>
          )}

          {/* Plan mode toggle — icon-only chip */}
          {activeChat && (
            <button
              onClick={togglePlanMode}
              title={
                activeChat.planMode
                  ? "Plan mode ON — Claude will propose a plan before executing"
                  : "Toggle plan mode"
              }
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                activeChat.planMode
                  ? "border-co-primary bg-co-primary text-co-primary-fg"
                  : "border-co-fg/15 text-co-fg/60 hover:border-co-fg/30 hover:text-co-fg"
              }`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </button>
          )}
        </div>

        {dragActive && (
          <div className="absolute inset-0 z-40 bg-co-fg/60/10 dark:bg-co-fg/60/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-co-surface px-6 py-4 rounded-xl shadow-xl border-2 border-dashed border-co-fg/40 text-co-fg flex items-center gap-3">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="font-medium">Drop file to attach</span>
            </div>
          </div>
        )}

        {/* Folder pills */}
        {folderPills.length > 0 && (
          <div className="px-4 py-2 border-b border-co-fg/10 bg-co-surface flex flex-wrap items-center gap-2">
            <span className="text-xs text-co-fg/50 font-medium">
              Working in:
            </span>
            {folderPills.map((f) => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-co-fg/[0.08] text-co-fg text-xs rounded-md font-mono"
                title={f.path}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-co-fg/55"
                >
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
                {f.name}
                <button
                  onClick={() => removeFolder(f.path)}
                  className="hover:text-red-500"
                  title="Remove"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 relative min-h-0">
          <div
            ref={messagesRef}
            className="absolute inset-0 overflow-y-auto px-4 py-6"
          >
            {!activeId ? (
              <div className="relative flex h-full items-center justify-center px-4">
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.08] blur-3xl"
                  style={{
                    background:
                      "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
                  }}
                />
                <div className="relative max-w-md text-center">
                  <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-co-lg bg-co-surface ring-1 ring-co-fg/[0.08]">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-co-fg/50"
                    >
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />
                    </svg>
                    <span
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ background: "rgb(var(--co-accent-rgb))" }}
                    >
                      @
                    </span>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-co-fg/40">
                    Conversation
                  </div>
                  <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-co-fg">
                    Start a new thread
                  </h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-co-fg/55">
                    Type{" "}
                    <code className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-co-fg/80">
                      @
                    </code>{" "}
                    to mention an agent or folder. The orchestrator routes your
                    message to the right specialist.
                  </p>
                  <button
                    onClick={newChat}
                    className="mt-6 inline-flex items-center gap-2 rounded-co bg-co-primary px-4 py-2.5 text-sm font-semibold text-co-primary-fg transition-opacity hover:opacity-90"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    New chat
                  </button>
                </div>
              </div>
            ) : messages.length === 0 && !streaming ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-co-lg bg-co-surface ring-1 ring-co-fg/[0.08]">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-co-fg/50"
                  >
                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold tracking-tight text-co-fg">
                  Say hi to your team
                </h3>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-co-fg/55">
                  Type{" "}
                  <code className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-co-fg/80">
                    @
                  </code>{" "}
                  to mention an agent (e.g.{" "}
                  <code className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-co-fg/80">
                    @finance
                  </code>
                  ) or a folder to switch the working directory.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                {messages.map((m, i) => (
                  <MessageBlock key={i} msg={m} />
                ))}

                {streaming && (
                  <StreamingBubble
                    toolEvents={toolEvents}
                    streamText={streamText}
                  />
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {!pinnedToBottom && activeId && messages.length > 0 && (
            <button
              onClick={jumpToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-co-primary text-co-primary-fg text-xs rounded-full shadow-lg hover:opacity-90 flex items-center gap-1.5 z-10"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
              <span>{streaming ? "Jump to latest" : "Jump to bottom"}</span>
            </button>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-co-fg/10 p-3 bg-co-surface">
          <div className="max-w-3xl mx-auto relative">
            {mentionQuery !== null && (
              <MentionPopup
                items={mentionItems}
                selectedIndex={mentionIndex}
                onPick={pickMentionItem}
                onHover={setMentionIndex}
              />
            )}
            {recallQuery || (mentionQuery && recallFile) ? (
              <RecallPanel
                query={recallQuery || mentionQuery}
                file={recallFile}
                project={activeChat?.companyId}
                mode={recallQuery ? "command" : "auto"}
              />
            ) : null}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((a) => (
                  <span
                    key={a._localId}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border ${
                      a.uploading
                        ? "bg-co-bg border-co-fg/10 text-co-fg/50"
                        : "bg-co-fg/[0.05] border-co-fg/10 text-co-fg"
                    }`}
                  >
                    <span className="text-co-fg/55">
                      {a.contentType?.startsWith("image/") ? (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      ) : (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                      )}
                    </span>
                    <span className="font-mono truncate max-w-[200px]">
                      {a.filename}
                    </span>
                    {a.uploading ? (
                      <svg
                        className="w-3 h-3 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8z"
                        />
                      </svg>
                    ) : (
                      <button
                        onClick={() => removeAttachment(a._localId)}
                        className="hover:text-red-500"
                        title="Remove"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {/* Devin-style composer: textarea on top, controls row below */}
            <div className="flex flex-col rounded-3xl border border-co-fg/10 bg-co-surface px-5 py-4 transition-all focus-within:border-co-fg/25">
              <textarea
                ref={inputRef}
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={
                  activeId ? "Ask FreeBird about your code…" : "Create a chat first"
                }
                disabled={!activeId || streaming}
                rows={1}
                className="max-h-40 w-full resize-none bg-transparent text-[15px] leading-relaxed text-co-fg placeholder:text-co-fg/40 focus:outline-none"
                style={{ minHeight: "28px" }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height =
                    Math.min(e.target.scrollHeight, 160) + "px";
                }}
              />

              {/* Bottom controls row */}
              <div className="mt-3 flex items-center gap-1.5">
                {/* Left: model pill (Devin's "Auto") */}
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-co-fg/15 px-3 py-1.5 text-xs font-medium text-co-fg/75 transition-colors hover:border-co-fg/30 hover:bg-co-fg/[0.04] hover:text-co-fg"
                  title="Change model"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
                  </svg>
                  {models.find((m) => m.id === currentModel)?.label || "Auto"}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-co-fg/45"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* + Attach */}
                <label
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-co-fg/55 transition-colors hover:bg-co-fg/[0.06] hover:text-co-fg"
                  title="Attach file"
                >
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      uploadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </label>

                <div className="flex-1" />

                {/* Mic placeholder (voice input — not wired) */}
                <button
                  type="button"
                  title="Voice input (coming soon)"
                  disabled
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-co-fg/35 transition-colors hover:bg-co-fg/[0.04] disabled:cursor-not-allowed"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
                  </svg>
                </button>

                {/* Send / Stop — circular */}
                {streaming ? (
                  <button
                    onClick={stop}
                    title="Stop"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-co-destructive text-white transition-opacity hover:opacity-90"
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="1.5" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={
                      (!input.trim() && attachments.length === 0) ||
                      !activeId ||
                      attachments.some((a) => a.uploading)
                    }
                    title="Send (Enter)"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-co-primary text-co-primary-fg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:bg-co-fg/15 disabled:text-co-fg/40"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Model dropdown popup */}
              {modelMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setModelMenuOpen(false)}
                  />
                  <div className="absolute bottom-full left-5 z-40 mb-2 w-48 overflow-hidden rounded-co border border-co-fg/10 bg-co-surface shadow-[0_8px_32px_-12px_rgba(0,0,0,0.25)]">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setChatModel(m.id);
                          setModelMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-co-fg/[0.05] ${
                          currentModel === m.id
                            ? "font-semibold text-co-fg"
                            : "text-co-fg/70"
                        }`}
                      >
                        {m.label}
                        {currentModel === m.id && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Scope chip below (like Devin's "All repositories") */}
            <div className="mt-2.5 flex items-center justify-between gap-3 px-1">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[11px] text-co-fg/50 transition-colors hover:text-co-fg/80"
                title="Type @ to add a folder to this chat"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
                {folderPills.length === 0
                  ? "All repositories"
                  : folderPills.length === 1
                    ? folderPills[0].name
                    : `${folderPills.length} folders scoped`}
              </button>
              <p className="text-[10px] text-co-fg/35">
                <kbd className="rounded bg-co-fg/[0.05] px-1 py-0.5 font-mono text-[9px] text-co-fg/55">
                  @
                </kbd>{" "}
                mention ·{" "}
                <kbd className="rounded bg-co-fg/[0.05] px-1 py-0.5 font-mono text-[9px] text-co-fg/55">
                  ⏎
                </kbd>{" "}
                send
              </p>
            </div>
          </div>
        </div>
      </main>

      {livePanelOpen && activeId && (
        <LiveFilePanel
          chatId={activeId}
          fileEdits={fileEdits}
          onClose={() => setLivePanelOpen(false)}
        />
      )}
    </div>
  );
}
