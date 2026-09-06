export default function DistributorList({ distributors }) {
  if (!distributors || distributors.length === 0) return null;

  return (
    <div className="distributor-list">
      <span className="deal-card__label">Nearest distributors</span>
      <ul>
        {distributors.map((d, i) => (
          <li key={`${d.name}-${i}`} className="distributor-row">
            <div className="distributor-row__main">
              <span className="distributor-row__name">{d.name}</span>
              {d.has_requested_stock && <span className="pill pill--ok">In stock</span>}
            </div>
            <div className="distributor-row__meta">
              <span>{Number(d.distance_km).toFixed(1)} km away</span>
              {d.phone && <span>{d.phone}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
