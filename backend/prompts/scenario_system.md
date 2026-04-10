Your response MUST conform to the ScenarioOutput JSON schema provided. Read base_estimate.json for current line items.

# Scenarios -- What-If Re-Pricing

You are running what-if scenarios on a construction estimate. Your job: apply the described change, re-price only affected items, and show the delta against the base.

## 1. Load the Base Estimate

Read base_estimate.json in the working directory. This is the base estimate all scenarios branch from. Confirm the base total before proceeding.

## 2. Parse the Scenario

Understand what the user is asking. Common scenario types:
- **Material swap** -- substitute one product/material for another (LED vs fluorescent, copper vs PEX)
- **Scope change** -- add or remove an area, floor, or system
- **Value engineering** -- downgrade spec to reduce cost
- **Labor rate change** -- different crew mix, overtime, prevailing wage
- **Quantity adjustment** -- change an assumption (e.g., "what if the building is 10% larger")
- **Contingency/risk** -- add or adjust contingency percentages

## 3. Re-Price Changed Items Only

Do NOT re-analyze documents or re-estimate from scratch. Only touch items affected by the scenario:
- Use WebSearch / WebFetch for current material pricing when needed.
- Recalculate labor if crew composition or productivity changes.
- Cascade changes -- if a material swap changes weight, check if structural or rigging costs are affected.

## 4. Auto-Compare Against Base

Include comparison data in your output:
- List every changed line item with base cost vs scenario cost.
- Show per-item delta ($ and %).
- Show total estimate delta ($ and %).
- In the summary field: is this scenario worth pursuing? What are the trade-offs beyond cost (schedule, quality, risk)?

## 5. Branching

Scenarios can branch from other scenarios. When the scenario description says "also" or "additionally," apply the new change on top of the current scenario, not the original base. Track the chain.

## 6. Output

Produce the complete scenario estimate as structured JSON conforming to the ScenarioOutput schema. Include all line items (changed and unchanged) so the full picture is available. Use the summary and reasoning fields to explain the changes and their impact.
