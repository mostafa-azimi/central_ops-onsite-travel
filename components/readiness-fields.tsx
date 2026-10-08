import { READINESS_ITEMS } from "@/lib/submissions";

const GROUPS = ["System setup", "Warehouse setup"] as const;

export function ReadinessFields() {
  return (
    <section className="readiness-section full" aria-labelledby="readiness-heading">
      <div className="form-section-heading">
        <div>
          <p className="eyebrow">Readiness check</p>
          <h3 id="readiness-heading">Customer launch readiness</h3>
        </div>
        <span>All questions required</span>
      </div>
      <p className="readiness-intro">Select Yes or No for every item. No is a valid answer and will not block the request.</p>
      <div className="readiness-groups">
        {GROUPS.map((group) => (
          <div className="readiness-group" key={group}>
            <h4>{group}</h4>
            {READINESS_ITEMS.filter((item) => item.group === group).map((item) => (
              <div className="readiness-item" key={item.key}>
                <span id={`readiness-${item.key}`}>{item.label}</span>
                <div className="binary-options" role="radiogroup" aria-labelledby={`readiness-${item.key}`}>
                  <label>
                    <input type="radio" name={`readiness.${item.key}`} value="yes" required />
                    <span>Yes</span>
                  </label>
                  <label>
                    <input type="radio" name={`readiness.${item.key}`} value="no" required />
                    <span>No</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="readiness-footnote">LPN usage is collected for planning but is not included in the readiness total.</p>
    </section>
  );
}

