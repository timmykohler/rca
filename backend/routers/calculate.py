from fastapi import APIRouter, HTTPException
from models import PlanInput, FundedRatioResult, ResourcesBreakdown, ClaimsBreakdown
from engine.actuarial import (
    actuarial_npv_spending,
    actuarial_npv_income,
    human_capital_pv,
    after_tax_portfolio_value,
    annuity_factor as calc_annuity_factor,
    max_sustainable_withdrawal_rate,
    target_funded_ratio,
    estimate_success_probability,
    interpolate_yield,
    DEFAULT_REAL_YIELD_CURVE,
)
from services import fred

router = APIRouter(tags=["Calculate"])


def _discount_future_amount(amount: float, years: int, tax_rate: float,
                             yield_curve=None) -> float:
    """PV of a one-time lump-sum received in `years` years, net of tax."""
    if years <= 0:
        return amount * (1 - tax_rate)
    r = interpolate_yield(years, yield_curve or fred.get_active_curve())
    after_tax = amount * (1 - tax_rate)
    return after_tax / ((1 + r) ** years)


@router.post("/calculate", response_model=FundedRatioResult)
def calculate_funded_ratio(plan: PlanInput) -> FundedRatioResult:
    age      = plan.investor_age
    gender   = plan.investor_gender.value
    co_age   = plan.co_investor_age if plan.has_co_investor else None
    co_gender = plan.co_investor_gender.value if plan.has_co_investor and plan.co_investor_gender else None
    income_tax = plan.effective_income_tax_rate
    ltcg       = plan.long_term_gains_rate

    # Live TIPS curve (override > FRED > embedded). Single source of truth
    # for every discount below — see services/fred.py
    curve = fred.get_active_curve()

    # ── RESOURCES ────────────────────────────────────────────────────────────

    # 1. Portfolio (investment accounts), after-tax
    portfolio_at = sum(
        after_tax_portfolio_value(
            a.present_value, a.cost_basis,
            a.account_type.value, income_tax, ltcg,
        )
        for a in plan.portfolio_assets
    )

    # 2. Private / physical assets net of debt and embedded tax
    private_net = 0.0
    for pa in plan.private_assets:
        net = pa.value - pa.debt_owed
        gain_tax = max(0, pa.value - pa.cost_basis) * pa.tax_rate
        private_net += net - gain_tax

    # 3. Standalone liabilities not attached to a specific asset
    liabilities_total = sum(l.balance for l in plan.liabilities)

    # 4. Social Security PV
    ss_pv = 0.0
    for ss in plan.social_security:
        o_age    = age if ss.owner == "investor" else (co_age or age)
        o_gender = gender if ss.owner == "investor" else (co_gender or gender)
        ss_pv += actuarial_npv_income(
            annual_amount=ss.annual_amount,
            current_age=age, owner_age=o_age, owner_gender=o_gender,
            start_age=ss.start_age, annual_adjustment=ss.annual_adjustment,
            co_age=co_age, co_gender=co_gender,
            real_yield_curve=curve,
        )

    # 5. Unified retirement income PV (new RetirementIncome list)
    ret_income_pv = 0.0
    for ri in plan.retirement_income:
        o_age    = age if ri.owner == "investor" else (co_age or age)
        o_gender = gender if ri.owner == "investor" else (co_gender or gender)
        start    = ri.start_age or age
        end      = ri.end_age   # None → life
        surv_pct = ri.survivorship_percentage if ri.survivorship else 0.0
        if end is not None:
            # Finite-term: use spending NPV with mortality
            ret_income_pv += actuarial_npv_spending(
                annual_spend=ri.annual_amount,
                current_age=age, gender=o_gender,
                start_age=start, end_age=end,
                annual_adjustment=ri.annual_adjustment,
                co_age=co_age if ri.survivorship else None,
                co_gender=co_gender if ri.survivorship else None,
                real_yield_curve=curve,
            )
        else:
            ret_income_pv += actuarial_npv_income(
                annual_amount=ri.annual_amount,
                current_age=age, owner_age=o_age, owner_gender=o_gender,
                start_age=start, annual_adjustment=ri.annual_adjustment,
                survivorship_pct=surv_pct, co_age=co_age, co_gender=co_gender,
                real_yield_curve=curve,
            )

    # 6. Legacy pension PV
    pension_pv = 0.0
    for p in plan.pensions:
        o_age    = age if p.owner == "investor" else (co_age or age)
        o_gender = gender if p.owner == "investor" else (co_gender or gender)
        surv_pct = p.survivorship_percentage if p.survivorship else 0.0
        pension_pv += actuarial_npv_income(
            annual_amount=p.annual_amount, current_age=age,
            owner_age=o_age, owner_gender=o_gender, start_age=p.start_age,
            annual_adjustment=p.annual_adjustment, survivorship_pct=surv_pct,
            co_age=co_age, co_gender=co_gender,
            real_yield_curve=curve,
        )

    # 7. Legacy annuity PV
    annuity_pv = 0.0
    for a in plan.annuities:
        o_age    = age if a.owner == "investor" else (co_age or age)
        o_gender = gender if a.owner == "investor" else (co_gender or gender)
        surv_pct = a.survivorship_percentage if a.survivorship else 0.0
        annuity_pv += actuarial_npv_income(
            annual_amount=a.annual_amount, current_age=age,
            owner_age=o_age, owner_gender=o_gender, start_age=a.start_age,
            annual_adjustment=a.annual_adjustment, survivorship_pct=surv_pct,
            co_age=co_age, co_gender=co_gender,
            real_yield_curve=curve,
        )

    # 8. Legacy other income PV
    other_pv = 0.0
    for oi in plan.other_income:
        o_age    = age if oi.owner == "investor" else (co_age or age)
        o_gender = gender if oi.owner == "investor" else (co_gender or gender)
        start = oi.start_age or age
        end   = oi.end_age or 100
        other_pv += actuarial_npv_income(
            annual_amount=oi.annual_amount, current_age=age,
            owner_age=o_age, owner_gender=o_gender, start_age=start,
            annual_adjustment=oi.annual_adjustment,
            real_yield_curve=curve,
        )

    # 9. Future assets (inheritance, gifts, settlements, etc.) — discounted PV
    future_assets_pv = 0.0
    for fa in plan.future_assets:
        years = max(0, fa.expected_age - age)
        future_assets_pv += _discount_future_amount(fa.amount, years, fa.tax_rate, curve)

    # 10. Human capital / future savings (Eq. 2)
    hc_pv = 0.0
    for fs in plan.future_savings:
        hc_pv += human_capital_pv(
            annual_contribution=fs.annual_contribution,
            current_age=age, start_age=fs.start_age, end_age=fs.end_age,
            annual_adjustment=fs.annual_adjustment,
            real_yield_curve=curve,
        )

    total_resources = (
        portfolio_at + private_net
        - liabilities_total
        + ss_pv + ret_income_pv + pension_pv + annuity_pv + other_pv
        + future_assets_pv + hc_pv
    )

    # ── CLAIMS ───────────────────────────────────────────────────────────────

    spending_breakdown = []
    total_claims = 0.0
    for sg in plan.spending_goals:
        start = sg.start_age or age
        end   = sg.end_age or 100
        pv = actuarial_npv_spending(
            annual_spend=sg.annual_amount, current_age=age, gender=gender,
            start_age=start, end_age=end,
            annual_adjustment=sg.annual_adjustment,
            co_age=co_age, co_gender=co_gender,
            real_yield_curve=curve,
        )
        spending_breakdown.append({
            "label": sg.label,
            "grouping": sg.grouping or "essential",
            "annual_amount": sg.annual_amount,
            "pv": round(pv, 2),
        })
        total_claims += pv

    if total_claims <= 0:
        raise HTTPException(status_code=422,
            detail="Total spending claims must be greater than zero.")

    # ── METRICS ───────────────────────────────────────────────────────────────

    funded_ratio  = total_resources / total_claims
    af            = calc_annuity_factor(age, gender, co_age=co_age, co_gender=co_gender, real_yield_curve=curve)
    mswr          = max_sustainable_withdrawal_rate(age, gender, co_age=co_age, co_gender=co_gender, real_yield_curve=curve)
    prob_success  = estimate_success_probability(funded_ratio, age)
    target_70     = target_funded_ratio(age, "70")
    target_80     = target_funded_ratio(age, "80")

    if funded_ratio >= 1.15:
        status, msg = "overfunded",   "Plan is well-funded with a meaningful surplus. Strong retirement readiness."
    elif funded_ratio >= 1.0:
        status, msg = "fully_funded", "Plan meets the minimum funding threshold. Consider building a larger buffer."
    elif funded_ratio >= target_70:
        status, msg = "at_risk",      "Plan is below fully funded but on track for target. Review savings and spending."
    else:
        status, msg = "underfunded",  "Plan is underfunded relative to age-based targets. Action recommended."

    return FundedRatioResult(
        funded_ratio=round(funded_ratio, 4),
        funded_ratio_pct=round(funded_ratio * 100, 2),
        surplus_deficit=round(total_resources - total_claims, 2),
        resources=ResourcesBreakdown(
            portfolio_after_tax=round(portfolio_at, 2),
            private_assets_net=round(private_net, 2),
            liabilities_total=round(liabilities_total, 2),
            social_security_pv=round(ss_pv, 2),
            retirement_income_pv=round(ret_income_pv, 2),
            pension_pv=round(pension_pv, 2),
            annuity_pv=round(annuity_pv, 2),
            other_income_pv=round(other_pv, 2),
            future_assets_pv=round(future_assets_pv, 2),
            human_capital_pv=round(hc_pv, 2),
            total_resources=round(total_resources, 2),
        ),
        claims=ClaimsBreakdown(
            spending_goals=spending_breakdown,
            total_claims=round(total_claims, 2),
        ),
        probability_of_success=round(prob_success, 4),
        target_funded_ratio_70=round(target_70, 4),
        target_funded_ratio_80=round(target_80, 4),
        max_sustainable_withdrawal_rate=round(mswr, 4),
        annuity_factor=round(af, 4),
        status=status,
        status_message=msg,
        investor_name=plan.investor_name,
        description=plan.description or "",
        investor_age=age,
    )
