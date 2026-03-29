import { useState } from "react";
import {
  Skull,
  Loader2,
  AlertTriangle,
  Zap,
  Server,
  Cpu,
  HardDrive,
  Network,
  Clock,
  FlaskConical,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { triggerChaos } from "../lib/api";

const CHAOS_SCENARIOS = [
  { id: "pod-kill", label: "Pod Kill", icon: Skull, color: "text-red-400" },
  { id: "cpu-stress", label: "CPU Stress", icon: Cpu, color: "text-orange-400" },
  { id: "memory-leak", label: "Memory Leak", icon: HardDrive, color: "text-yellow-400" },
  { id: "network-delay", label: "Network Delay", icon: Network, color: "text-blue-400" },
  { id: "node-drain", label: "Node Drain", icon: Server, color: "text-purple-400" },
  { id: "latency-spike", label: "Latency Spike", icon: Zap, color: "text-cyan-400" },
];

export default function ChaosButton() {
  const [loading, setLoading] = useState(false);
  const [injected, setInjected] = useState<{ scenario: string; applied_at: string }[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(
    new Set(CHAOS_SCENARIOS.map((s) => s.id))
  );

  const toggleScenario = (id: string) => {
    setSelectedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleChaos = async () => {
    setLoading(true);
    setError(null);
    setInjected([]);

    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);

    try {
      const result = await triggerChaos(3);
      setInjected(
        result.scenarios ?? [{ scenario: "Chaos injected", applied_at: new Date().toISOString() }]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chaos trigger failed");
    } finally {
      setLoading(false);
    }
  };

  const getScenarioIcon = (scenario: string) => {
    const lower = scenario.toLowerCase();
    if (lower.includes("cpu") || lower.includes("stress")) return Cpu;
    if (lower.includes("memory") || lower.includes("leak") || lower.includes("oom")) return HardDrive;
    if (lower.includes("network") || lower.includes("latency") || lower.includes("delay")) return Network;
    if (lower.includes("node") || lower.includes("drain")) return Server;
    if (lower.includes("kill") || lower.includes("crash") || lower.includes("delete")) return Skull;
    return Zap;
  };

  const getScenarioColor = (scenario: string) => {
    const lower = scenario.toLowerCase();
    if (lower.includes("cpu") || lower.includes("stress")) return "from-orange-500/20 to-orange-500/5 border-orange-500/30 text-orange-300";
    if (lower.includes("memory") || lower.includes("leak") || lower.includes("oom")) return "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30 text-yellow-300";
    if (lower.includes("network") || lower.includes("latency") || lower.includes("delay")) return "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-300";
    if (lower.includes("node") || lower.includes("drain")) return "from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-300";
    if (lower.includes("kill") || lower.includes("crash") || lower.includes("delete")) return "from-red-500/20 to-red-500/5 border-red-500/30 text-red-300";
    return "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-300";
  };

  return (
    <div className="min-h-full flex flex-col gap-6 p-6">
      {/* Warning Banner */}
      <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3">
        <AlertTriangle size={20} className="text-amber-400 shrink-0" />
        <p className="text-sm text-amber-200/90 font-medium">
          This will inject real failures into the live cluster. Ensure your incident response agent is running.
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-red-500/15 rounded-xl border border-red-500/20">
          <FlaskConical size={22} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Chaos Engineering Lab</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Trigger controlled failure scenarios to test K8sWhisperer's autonomous response
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left: Scenario Selector */}
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Scenario Types
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {CHAOS_SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              const isSelected = selectedScenarios.has(scenario.id);
              return (
                <button
                  key={scenario.id}
                  onClick={() => toggleScenario(scenario.id)}
                  className={`
                    flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer
                    border
                    ${
                      isSelected
                        ? "bg-slate-800/80 border-slate-600/60 text-white"
                        : "bg-slate-900/40 border-slate-800/40 text-slate-500"
                    }
                  `}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      isSelected ? "bg-slate-700/60" : "bg-slate-800/40"
                    }`}
                  >
                    <Icon size={15} className={isSelected ? scenario.color : "text-slate-600"} />
                  </div>
                  <span className="text-sm font-medium">{scenario.label}</span>
                  <div className="ml-auto">
                    <div
                      className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                        isSelected ? "border-emerald-400 bg-emerald-400/20" : "border-slate-600"
                      }`}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            Selection is visual only. The backend injects randomized scenarios from its own pool.
          </p>
        </div>

        {/* Center: The Big Button */}
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="relative">
            {/* Outer glow rings */}
            <div
              className={`absolute inset-0 rounded-full transition-all duration-1000 ${
                loading
                  ? "opacity-0"
                  : "animate-ping bg-red-500/10"
              }`}
              style={{ margin: "-20px" }}
            />
            <div
              className={`absolute inset-0 rounded-full transition-all duration-700 ${
                loading
                  ? "opacity-0"
                  : "animate-pulse bg-red-500/5"
              }`}
              style={{ margin: "-40px" }}
            />

            {/* Button ring */}
            <div
              className={`relative w-48 h-48 rounded-full p-1 transition-all duration-500 ${
                countdown !== null
                  ? "bg-gradient-to-br from-amber-500 via-red-500 to-orange-500"
                  : loading
                  ? "bg-gradient-to-br from-slate-600 to-slate-700"
                  : "bg-gradient-to-br from-red-500 via-red-600 to-red-700 hover:from-red-400 hover:via-red-500 hover:to-red-600"
              }`}
            >
              <button
                onClick={handleChaos}
                disabled={loading}
                className={`
                  w-full h-full rounded-full font-mono font-bold uppercase tracking-wider
                  transition-all duration-300 cursor-pointer flex flex-col items-center justify-center
                  ${
                    countdown !== null
                      ? "bg-slate-950 text-amber-400"
                      : loading
                      ? "bg-slate-900 text-slate-500 cursor-not-allowed"
                      : "bg-slate-950 text-red-400 hover:text-red-300 hover:bg-slate-900 active:scale-95"
                  }
                `}
              >
                {countdown !== null ? (
                  <span className="text-7xl font-black tabular-nums leading-none drop-shadow-[0_0_30px_rgba(251,191,36,0.5)]">
                    {countdown}
                  </span>
                ) : loading ? (
                  <Loader2 size={40} className="animate-spin text-slate-500" />
                ) : (
                  <>
                    <Skull size={36} className="mb-2" />
                    <span className="text-sm tracking-[0.2em]">INJECT</span>
                    <span className="text-sm tracking-[0.2em]">CHAOS</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {countdown !== null && (
            <p className="text-amber-400/80 text-sm font-mono animate-pulse">
              Initiating chaos sequence...
            </p>
          )}
          {!loading && !countdown && injected.length === 0 && (
            <p className="text-slate-500 text-sm text-center max-w-[220px]">
              Press the button to inject 3 random failure scenarios
            </p>
          )}
        </div>

        {/* Right: Results Timeline */}
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Injection Timeline
            </h2>
          </div>

          {injected.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/30 flex items-center justify-center mb-3">
                <FlaskConical size={24} className="text-slate-600" />
              </div>
              <p className="text-sm text-slate-500">No scenarios injected yet</p>
              <p className="text-xs text-slate-600 mt-1">Results will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {injected.map((item, i) => {
                const Icon = getScenarioIcon(item.scenario);
                const colorClass = getScenarioColor(item.scenario);
                const time = item.applied_at
                  ? new Date(item.applied_at).toLocaleTimeString()
                  : "just now";
                return (
                  <div
                    key={i}
                    className={`
                      relative bg-gradient-to-r ${colorClass} border rounded-xl p-4
                      animate-[fadeIn_0.4s_ease-out_forwards]
                    `}
                    style={{ animationDelay: `${i * 150}ms`, opacity: 0 }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-black/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.scenario}</p>
                        <p className="text-xs opacity-60 mt-0.5 font-mono">{time}</p>
                      </div>
                      <CheckCircle2 size={16} className="text-emerald-400/70 shrink-0 mt-1" />
                    </div>
                  </div>
                );
              })}

              {injected.length > 0 && (
                <div className="pt-2 border-t border-slate-700/30 mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Total injected</span>
                    <span className="text-emerald-400 font-bold font-mono">{injected.length}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mt-4 flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">Injection Failed</p>
                <p className="text-xs text-red-400/80 mt-0.5 font-mono">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inline keyframes for fadeIn animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
