import { useState } from "react";
import { Skull, Loader2 } from "lucide-react";
import { triggerChaos } from "../lib/api";

export default function ChaosButton() {
  const [loading, setLoading] = useState(false);
  const [injected, setInjected] = useState<string[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChaos = async () => {
    setLoading(true);
    setError(null);
    setInjected([]);

    // Countdown
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);

    try {
      const result = await triggerChaos(3);
      setInjected(result.injected ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chaos failed (ironic)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleChaos}
        disabled={loading}
        className={`
          relative w-40 h-40 rounded-full font-mono font-bold text-lg uppercase tracking-wider
          transition-all duration-300 cursor-pointer
          ${loading
            ? "bg-red-900/50 text-red-300/50 border-2 border-red-800/50"
            : "bg-red-600 text-white border-2 border-red-500 hover:bg-red-500 hover:scale-105 animate-pulse-red shadow-lg shadow-red-500/25"
          }
        `}
      >
        {countdown !== null ? (
          <span className="text-4xl font-bold">{countdown}</span>
        ) : loading ? (
          <Loader2 size={32} className="animate-spin mx-auto" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Skull size={32} />
            <span className="text-sm">BREAK</span>
            <span className="text-sm">THINGS</span>
          </div>
        )}
      </button>

      {injected.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 w-full max-w-sm">
          <div className="text-xs text-red-400 uppercase tracking-wider mb-2 font-mono">
            Chaos Injected
          </div>
          {injected.map((item, i) => (
            <div key={i} className="text-sm text-red-300 font-mono py-1 border-b border-red-500/10 last:border-0">
              {i + 1}. {item}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 font-mono bg-red-500/10 rounded-lg px-4 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
