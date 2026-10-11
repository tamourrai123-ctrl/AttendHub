/**
 * Minimal read-only JSON pretty-printer — deliberately dependency-free
 * (no syntax-highlighting library) since this is the only place Phase 2
 * needs one. Keys, strings, numbers, and booleans/null each get a subtle
 * color so nested mock request/response bodies stay scannable.
 */
export default function JsonViewer({ data }: { data: unknown }) {
  const text = JSON.stringify(data ?? null, null, 2);

  const tokenized = text.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)/g);

  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-200">
      <code>
        {tokenized.map((token, index) => {
          if (/^"(?:\\.|[^"\\])*"\s*:$/.test(token)) {
            return (
              <span key={index} className="text-sky-300">
                {token}
              </span>
            );
          }
          if (/^"(?:\\.|[^"\\])*"$/.test(token)) {
            return (
              <span key={index} className="text-emerald-300">
                {token}
              </span>
            );
          }
          if (/^(?:true|false|null)$/.test(token)) {
            return (
              <span key={index} className="text-fuchsia-300">
                {token}
              </span>
            );
          }
          if (/^-?\d+(?:\.\d+)?$/.test(token)) {
            return (
              <span key={index} className="text-amber-300">
                {token}
              </span>
            );
          }
          return <span key={index}>{token}</span>;
        })}
      </code>
    </pre>
  );
}
