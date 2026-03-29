import { useState } from "react";
import { LayoutDashboard, ScrollText, Radio, Link } from "lucide-react";
import Dashboard from "./components/Dashboard";
import AuditLog from "./components/AuditLog";
import WarRoom from "./components/WarRoom";

type Tab = "dashboard" | "audit" | "warroom" | "blockchain";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { id: "audit", label: "Audit Log", icon: <ScrollText size={16} /> },
  { id: "warroom", label: "War Room", icon: <Radio size={16} /> },
  { id: "blockchain", label: "Blockchain", icon: <Link size={16} /> },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <span className="text-cyan-400 font-bold text-sm font-mono">K8</span>
              </div>
              <div>
                <span className="text-sm font-mono font-semibold text-slate-200">
                  K8sWhisperer
                </span>
                <span className="text-xs text-slate-600 font-mono ml-2">
                  Mission Control
                </span>
              </div>
            </div>

            {/* Tabs */}
            <nav className="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider
                    transition-all cursor-pointer
                    ${
                      activeTab === tab.id
                        ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                        : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border border-transparent"
                    }
                  `}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono text-slate-500">LIVE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "audit" && <AuditLog />}
        {activeTab === "warroom" && <WarRoom />}
        {activeTab === "blockchain" && <BlockchainView />}
      </main>
    </div>
  );
}

function BlockchainView() {
  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 mb-4">
          Blockchain Audit Trail
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4 bg-slate-900/50 rounded-lg p-4 border border-slate-700/30">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Link size={20} className="text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-mono text-slate-300">
                Every incident remediation is hashed and stored on-chain for
                tamper-proof audit compliance.
              </p>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Connect to the backend API to view blockchain records.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 text-center">
              <div className="text-2xl font-bold font-mono text-purple-400">--</div>
              <div className="text-xs text-slate-500 font-mono mt-1">Blocks</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 text-center">
              <div className="text-2xl font-bold font-mono text-purple-400">--</div>
              <div className="text-xs text-slate-500 font-mono mt-1">Transactions</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/30 text-center">
              <div className="text-2xl font-bold font-mono text-purple-400">SHA-256</div>
              <div className="text-xs text-slate-500 font-mono mt-1">Hash Algorithm</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
