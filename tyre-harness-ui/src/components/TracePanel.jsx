import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const AGENT_LABELS = {
  intake: 'Intake Agent',
  catalog_match: 'Catalog Matching Agent',
  deal: 'Deal Agent',
  locator: 'Locator Agent',
  critic: 'Critic / Compliance Agent',
};

function TraceStep({ index, step }) {
  const [open, setOpen] = useState(false);
  const label = AGENT_LABELS[step.agent] || step.agent;

  return (
    <li className="trace-step">
      <button
        className="trace-step__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="trace-step__index">{index + 1}</span>
        <span className="trace-step__label">{label}</span>
        <ChevronDown
          size={16}
          className={`trace-step__chevron ${open ? 'trace-step__chevron--open' : ''}`}
        />
      </button>
      {open && (
        <pre className="trace-step__body">
          {JSON.stringify(step.output, null, 2)}
        </pre>
      )}
    </li>
  );
}

export default function TracePanel({ trace }) {
  if (!trace || trace.length === 0) {
    return <p className="trace-empty">No turns yet — send a message to see the harness run.</p>;
  }

  return (
    <ol className="trace-list">
      {trace.map((step, i) => (
        <TraceStep key={`${step.agent}-${i}`} index={i} step={step} />
      ))}
    </ol>
  );
}
