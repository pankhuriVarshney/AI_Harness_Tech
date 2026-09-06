export default function DealCard({ deal }) {
  if (!deal) return null;

  const exceedsPolicy = Boolean(deal.exceeds_policy);

  return (
    <div className="deal-card">
      <div className="deal-card__row deal-card__row--head">
        <span className="deal-card__label">Indicative deal</span>
        {exceedsPolicy && <span className="pill pill--amber">Above policy limit</span>}
      </div>

      <div className="deal-card__skus">
        {(deal.proposed_sku_ids || []).map((id) => (
          <code key={id} className="sku-tag">{id}</code>
        ))}
      </div>

      <div className="deal-card__figures">
        <div>
          <span className="deal-card__figure-label">Discount</span>
          <span className="deal-card__figure-value">{deal.discount_pct}%</span>
        </div>
        <div>
          <span className="deal-card__figure-label">Total, after discount</span>
          <span className="deal-card__figure-value">
            ₹{Number(deal.total_after_discount_inr).toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {deal.disclaimer && <p className="deal-card__disclaimer">{deal.disclaimer}</p>}
    </div>
  );
}
