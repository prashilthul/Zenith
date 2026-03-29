import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
import { sendChat } from "../lib/api";
import type { ChatMessage } from "../types";

export default function WarRoom() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      content:
        "K8sWhisperer War Room active. I can help you investigate incidents, check cluster status, or discuss remediation strategies. What do you need?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await sendChat(text);
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: (response as any).response ?? (response as any).content ?? String(response),
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: `Error: ${err instanceof Error ? err.message : "Failed to reach agent"}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-slate-800/50 rounded-xl border border-slate-700/50">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm font-mono text-slate-400 uppercase tracking-wider">
          War Room
        </span>
        <span className="text-xs text-slate-600 font-mono ml-auto">
          {messages.length} messages
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                msg.role === "agent"
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {msg.role === "agent" ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div
              className={`max-w-[75%] rounded-xl px-4 py-3 ${
                msg.role === "agent"
                  ? "bg-slate-900/60 border border-slate-700/50 text-slate-300"
                  : "bg-cyan-500/15 border border-cyan-500/20 text-cyan-100"
              }`}
            >
              <p className="text-sm font-mono whitespace-pre-wrap">{msg.content}</p>
              <span className="text-xs text-slate-600 font-mono mt-1 block">
                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ""}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-cyan-500/20 text-cyan-400">
              <Bot size={16} />
            </div>
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400 typing-dot" />
                <span className="w-2 h-2 rounded-full bg-cyan-400 typing-dot" />
                <span className="w-2 h-2 rounded-full bg-cyan-400 typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe an issue or ask about cluster state..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-3 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
