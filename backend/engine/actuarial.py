"""
Actuarial calculation engine based on:
  Pittman, S. "Use Your Client's Funded Ratio to Simplify and Improve
  Retirement Planning Decisions." The Journal of Retirement, Fall 2015.

Key formulas:
  Eq (1): Liability = sum[ D_t * p_t / (1 + r_t)^t ]  — actuarial NPV of spending
  Eq (2): Human Capital = sum[ C_t / (1 + r_t)^t ]    — PV of future contributions
  Eq (3): Funded Ratio = (Accum. Wealth + HC + Income Assets) / Liability
"""

import math
from typing import List, Dict, Optional, Tuple

# ─── SSA 2022 Period Life Table — qx (probability of dying within one year) ────
# Source: Social Security Administration, 2025 Trustees Report
# https://www.ssa.gov/oact/STATS/table4c6.html
# "Social Security Area Population" — complete table, ages 0 through 119.
# Replaces the previously used SOA 2000 Basic Tables.
# Note: SSA period tables reflect realized 2022 mortality rates, not cohort
# projections. The SSA also publishes improvement scales for cohort analysis.

SSA_2022_MALE_QX = {
      0: 0.006064,   1: 0.000491,   2: 0.000309,   3: 0.000248,   4: 0.000199,
      5: 0.000167,   6: 0.000143,   7: 0.000126,   8: 0.000121,   9: 0.000121,
     10: 0.000127,  11: 0.000143,  12: 0.000171,  13: 0.000227,  14: 0.000320,
     15: 0.000451,  16: 0.000622,  17: 0.000826,  18: 0.001026,  19: 0.001182,
     20: 0.001301,  21: 0.001404,  22: 0.001498,  23: 0.001586,  24: 0.001679,
     25: 0.001776,  26: 0.001881,  27: 0.001985,  28: 0.002095,  29: 0.002219,
     30: 0.002332,  31: 0.002445,  32: 0.002562,  33: 0.002653,  34: 0.002716,
     35: 0.002791,  36: 0.002894,  37: 0.002994,  38: 0.003091,  39: 0.003217,
     40: 0.003353,  41: 0.003499,  42: 0.003642,  43: 0.003811,  44: 0.003996,
     45: 0.004175,  46: 0.004388,  47: 0.004666,  48: 0.004973,  49: 0.005305,
     50: 0.005666,  51: 0.006069,  52: 0.006539,  53: 0.007073,  54: 0.007675,
     55: 0.008348,  56: 0.009051,  57: 0.009822,  58: 0.010669,  59: 0.011548,
     60: 0.012458,  61: 0.013403,  62: 0.014450,  63: 0.015571,  64: 0.016737,
     65: 0.017897,  66: 0.019017,  67: 0.020213,  68: 0.021569,  69: 0.023088,
     70: 0.024828,  71: 0.026705,  72: 0.028761,  73: 0.031116,  74: 0.033861,
     75: 0.037088,  76: 0.041126,  77: 0.045241,  78: 0.049793,  79: 0.054768,
     80: 0.060660,  81: 0.067027,  82: 0.073999,  83: 0.081737,  84: 0.090458,
     85: 0.100525,  86: 0.111793,  87: 0.124494,  88: 0.138398,  89: 0.153207,
     90: 0.169704,  91: 0.187963,  92: 0.208395,  93: 0.230808,  94: 0.253914,
     95: 0.277402,  96: 0.300882,  97: 0.324326,  98: 0.347332,  99: 0.369430,
    100: 0.391927, 101: 0.414726, 102: 0.437722, 103: 0.460800, 104: 0.483840,
    105: 0.508032, 106: 0.533434, 107: 0.560105, 108: 0.588111, 109: 0.617516,
    110: 0.648392, 111: 0.680812, 112: 0.714852, 113: 0.750595, 114: 0.788125,
    115: 0.827531, 116: 0.868907, 117: 0.912353, 118: 0.957970, 119: 1.000000,
}

SSA_2022_FEMALE_QX = {
      0: 0.005119,   1: 0.000398,   2: 0.000240,   3: 0.000198,   4: 0.000160,
      5: 0.000134,   6: 0.000118,   7: 0.000109,   8: 0.000106,   9: 0.000106,
     10: 0.000111,  11: 0.000121,  12: 0.000140,  13: 0.000162,  14: 0.000188,
     15: 0.000224,  16: 0.000276,  17: 0.000337,  18: 0.000395,  19: 0.000450,
     20: 0.000496,  21: 0.000532,  22: 0.000567,  23: 0.000610,  24: 0.000650,
     25: 0.000699,  26: 0.000743,  27: 0.000796,  28: 0.000855,  29: 0.000924,
     30: 0.000988,  31: 0.001053,  32: 0.001123,  33: 0.001198,  34: 0.001263,
     35: 0.001324,  36: 0.001403,  37: 0.001493,  38: 0.001596,  39: 0.001700,
     40: 0.001803,  41: 0.001905,  42: 0.002009,  43: 0.002116,  44: 0.002223,
     45: 0.002352,  46: 0.002516,  47: 0.002712,  48: 0.002936,  49: 0.003177,
     50: 0.003407,  51: 0.003642,  52: 0.003917,  53: 0.004238,  54: 0.004619,
     55: 0.005040,  56: 0.005493,  57: 0.005987,  58: 0.006509,  59: 0.007067,
     60: 0.007658,  61: 0.008305,  62: 0.008991,  63: 0.009681,  64: 0.010343,
     65: 0.011018,  66: 0.011743,  67: 0.012532,  68: 0.013512,  69: 0.014684,
     70: 0.016025,  71: 0.017468,  72: 0.019195,  73: 0.021195,  74: 0.023452,
     75: 0.025980,  76: 0.029153,  77: 0.032394,  78: 0.035888,  79: 0.039676,
     80: 0.044156,  81: 0.049087,  82: 0.054635,  83: 0.061066,  84: 0.068431,
     85: 0.076841,  86: 0.086205,  87: 0.096851,  88: 0.109019,  89: 0.121867,
     90: 0.135805,  91: 0.151108,  92: 0.168020,  93: 0.186340,  94: 0.206432,
     95: 0.228086,  96: 0.250406,  97: 0.273699,  98: 0.296984,  99: 0.319502,
    100: 0.342716, 101: 0.366532, 102: 0.390844, 103: 0.415531, 104: 0.440463,
    105: 0.466891, 106: 0.494904, 107: 0.524599, 108: 0.556075, 109: 0.589439,
    110: 0.624805, 111: 0.662294, 112: 0.702031, 113: 0.744153, 114: 0.788125,
    115: 0.827531, 116: 0.868907, 117: 0.912353, 118: 0.957970, 119: 1.000000,
}

# Aliases — the rest of this module references these names internally
SOA_2000_MALE_QX   = SSA_2022_MALE_QX
SOA_2000_FEMALE_QX = SSA_2022_FEMALE_QX

# ─── Real TIPS Yield Curve (approximate, as of analysis date) ──────────────────
# In production, these would be fetched from FRED or Treasury data feed.
# Format: {term_years: real_yield}
DEFAULT_REAL_YIELD_CURVE = {
    1:  -0.013,
    2:  -0.008,
    3:  -0.004,
    5:   0.002,
    7:   0.006,
    10:  0.009,
    15:  0.013,
    20:  0.016,
    25:  0.018,
    30:  0.019,
}

DEFAULT_NOMINAL_YIELD_CURVE = {
    1:  0.052,
    2:  0.050,
    3:  0.049,
    5:  0.047,
    7:  0.046,
    10: 0.045,
    15: 0.044,
    20: 0.044,
    25: 0.044,
    30: 0.044,
}


def interpolate_yield(term: int, curve: Dict[int, float]) -> float:
    """Linearly interpolate yield for a given term from the curve."""
    keys = sorted(curve.keys())
    if term <= keys[0]:
        return curve[keys[0]]
    if term >= keys[-1]:
        return curve[keys[-1]]
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= term <= hi:
            frac = (term - lo) / (hi - lo)
            return curve[lo] + frac * (curve[hi] - curve[lo])
    return curve[keys[-1]]


def survival_probability(
    current_age: int,
    target_age: int,
    gender: str,
    co_age: Optional[int] = None,
    co_gender: Optional[str] = None,
    survivorship_pct: float = 1.0,
) -> float:
    """
    P(at least one of investor/co-investor alive at target_age).
    For single: P(alive at target).
    For couple with survivorship: P(investor alive) + P(co alive) - P(both alive),
    weighted by survivorship_pct for the co-investor benefit.
    """
    qx_map = {
        "male": SSA_2022_MALE_QX,
        "female": SSA_2022_FEMALE_QX,
        "m": SSA_2022_MALE_QX,
        "f": SSA_2022_FEMALE_QX,
    }
    investor_qx = qx_map.get(gender.lower(), SSA_2022_FEMALE_QX)

    def px_single(start_age: int, end_age: int, qx: Dict) -> float:
        p = 1.0
        for age in range(start_age, end_age):
            # SSA table runs to age 119; qx=1.0 at 119, so survival past 119 = 0
            q = qx.get(age, 1.0)
            p *= (1 - q)
        return p

    p_investor = px_single(current_age, target_age, investor_qx)

    if co_age is None or co_gender is None:
        return p_investor

    co_qx = qx_map.get(co_gender.lower(), SOA_2000_FEMALE_QX)
    # Co-investor's age at same future point
    age_diff = co_age - current_age
    co_future_age = target_age + age_diff
    p_co = px_single(co_age, co_future_age, co_qx)
    p_both = p_investor * p_co

    # At least one alive (needed for joint spending) 
    # Survivorship_pct = fraction of spending that continues if one dies
    # Full joint: P(at least one alive)
    p_joint = p_investor + p_co - p_both
    return p_joint


def actuarial_npv_spending(
    annual_spend: float,
    current_age: int,
    gender: str,
    start_age: Optional[int] = None,
    end_age: Optional[int] = None,
    annual_adjustment: float = 0.0,
    co_age: Optional[int] = None,
    co_gender: Optional[str] = None,
    real_yield_curve: Optional[Dict] = None,
    use_real: bool = True,
) -> float:
    """
    Equation (1) from Pittman (2015):
    L = sum_{t=1}^{T} [ D_t * p_t / (1 + r_t)^t ]

    D_t = annual spending in period t (inflation-adjusted if real terms)
    p_t = probability of being alive in period t
    r_t = real TIPS yield for maturity t
    """
    if real_yield_curve is None:
        real_yield_curve = DEFAULT_REAL_YIELD_CURVE

    curve = real_yield_curve if use_real else DEFAULT_NOMINAL_YIELD_CURVE
    if start_age is None:
        start_age = current_age
    if end_age is None:
        end_age = 119  # SSA 2022 table runs through age 119

    total_pv = 0.0
    for future_age in range(start_age, end_age + 1):
        t = future_age - current_age
        if t <= 0:
            continue

        # Spending grows at (annual_adjustment - inflation) in real terms
        # If using real yields, D_t is constant in real terms (no inflation component)
        growth_factor = (1 + annual_adjustment) ** (t - 1) if annual_adjustment > 0 else 1.0
        D_t = annual_spend * growth_factor

        r_t = interpolate_yield(t, curve)
        discount = (1 + r_t) ** t

        p_t = survival_probability(
            current_age, future_age, gender, co_age, co_gender
        )

        total_pv += (D_t * p_t) / discount

    return total_pv


def actuarial_npv_income(
    annual_amount: float,
    current_age: int,
    owner_age: int,
    owner_gender: str,
    start_age: int,
    annual_adjustment: float = 0.0,
    survivorship_pct: float = 0.0,
    co_age: Optional[int] = None,
    co_gender: Optional[str] = None,
    real_yield_curve: Optional[Dict] = None,
) -> float:
    """
    Values income streams (Social Security, pension, annuity) as assets.
    Similar to Eq (1) but from the perspective of an asset cash flow.
    """
    if real_yield_curve is None:
        real_yield_curve = DEFAULT_REAL_YIELD_CURVE

    total_pv = 0.0
    for future_age in range(start_age, 120):  # SSA table covers through age 119
        t = future_age - current_age
        if t <= 0:
            continue

        years_paying = future_age - start_age
        growth_factor = (1 + annual_adjustment) ** years_paying if annual_adjustment > 0 else 1.0
        D_t = annual_amount * growth_factor

        r_t = interpolate_yield(t, real_yield_curve)
        discount = (1 + r_t) ** t

        # Probability owner is alive
        qx_map = {
            "male": SSA_2022_MALE_QX, "m": SSA_2022_MALE_QX,
            "female": SSA_2022_FEMALE_QX, "f": SSA_2022_FEMALE_QX,
        }
        owner_qx = qx_map.get(owner_gender.lower(), SSA_2022_FEMALE_QX)

        def px(start_a, end_a, qx):
            p = 1.0
            for a in range(start_a, end_a):
                p *= (1 - qx.get(a, 1.0))  # default 1.0 = certain death past table end
            return p

        p_owner = px(owner_age, future_age, owner_qx)

        # If survivorship, add probability co-investor is alive but owner is not
        if survivorship_pct > 0 and co_age and co_gender:
            co_qx = qx_map.get(co_gender.lower(), SSA_2022_FEMALE_QX)
            age_diff = co_age - current_age
            co_future_age = future_age + age_diff
            if co_future_age <= 119:
                p_co = px(co_age, co_future_age, co_qx)
                p_owner_dead = 1 - p_owner
                p_co_alive_owner_dead = p_co * p_owner_dead
                effective_p = p_owner + survivorship_pct * p_co_alive_owner_dead
            else:
                effective_p = p_owner
        else:
            effective_p = p_owner

        total_pv += (D_t * effective_p) / discount

    return total_pv


def human_capital_pv(
    annual_contribution: float,
    current_age: int,
    start_age: int,
    end_age: int,
    annual_adjustment: float = 0.0,
    real_yield_curve: Optional[Dict] = None,
) -> float:
    """
    Equation (2) from Pittman (2015):
    HC = sum_{t=1}^{R} [ C_t / (1 + r_t)^t ]
    No mortality discount — if contributor dies, life insurance covers the gap.
    """
    if real_yield_curve is None:
        real_yield_curve = DEFAULT_REAL_YIELD_CURVE

    total_pv = 0.0
    for future_age in range(start_age, end_age + 1):
        t = future_age - current_age
        if t <= 0:
            continue

        years_saving = future_age - start_age
        growth_factor = (1 + annual_adjustment) ** years_saving
        C_t = annual_contribution * growth_factor

        r_t = interpolate_yield(t, real_yield_curve)
        discount = (1 + r_t) ** t

        total_pv += C_t / discount

    return total_pv


def after_tax_portfolio_value(
    gross_value: float,
    cost_basis: float,
    account_type: str,
    income_tax_rate: float,
    ltcg_rate: float,
) -> float:
    """
    Adjusts portfolio value for embedded tax liability.
    - Taxable: tax on (value - basis) at LTCG rate
    - Traditional IRA/401k: full value taxed at income rate on withdrawal
    - Roth: no tax (after-tax contributions)
    """
    at = account_type.lower()
    if "roth" in at:
        return gross_value
    elif "ira" in at or "401" in at or "403" in at or "traditional" in at or "pre-tax" in at:
        # Simplified: tax-deferred, full amount subject to income tax
        tax_liability = gross_value * income_tax_rate
        return gross_value - tax_liability
    else:
        # Taxable brokerage: tax on unrealized gains
        unrealized_gain = max(0, gross_value - cost_basis)
        tax_liability = unrealized_gain * ltcg_rate
        return gross_value - tax_liability


def annuity_factor(
    current_age: int,
    gender: str,
    real_yield_curve: Optional[Dict] = None,
    co_age: Optional[int] = None,
    co_gender: Optional[str] = None,
) -> float:
    """
    Annuity factor = PV of $1/year for life.
    Used in Equations (5)-(9) to convert between funded ratio and withdrawal rate.
    """
    return actuarial_npv_spending(
        annual_spend=1.0,
        current_age=current_age,
        gender=gender,
        real_yield_curve=real_yield_curve,
        co_age=co_age,
        co_gender=co_gender,
    )


def max_sustainable_withdrawal_rate(
    current_age: int,
    gender: str,
    real_yield_curve: Optional[Dict] = None,
    co_age: Optional[int] = None,
    co_gender: Optional[str] = None,
) -> float:
    """
    Equation (8)/(9): Withdrawal rate <= 1 / annuity_factor
    """
    af = annuity_factor(current_age, gender, real_yield_curve, co_age, co_gender)
    if af <= 0:
        return 0.0
    return 1.0 / af


# ─── Target funded ratio by age (from Pittman Exhibit 5) ──────────────────────
# Interpolated from the 70% success line in Exhibit 5
TARGET_FUNDED_RATIO_70PCT = {
    25: 0.65, 30: 0.68, 35: 0.72, 40: 0.76, 45: 0.81,
    50: 0.86, 55: 0.91, 60: 0.96, 65: 1.00,
}

TARGET_FUNDED_RATIO_80PCT = {
    25: 0.72, 30: 0.76, 35: 0.80, 40: 0.84, 45: 0.88,
    50: 0.91, 55: 0.94, 60: 0.97, 65: 1.00,
}

TARGET_FUNDED_RATIO_60PCT = {
    25: 0.55, 30: 0.59, 35: 0.63, 40: 0.68, 45: 0.73,
    50: 0.79, 55: 0.86, 60: 0.93, 65: 1.00,
}


def target_funded_ratio(age: int, success_level: str = "70") -> float:
    """Returns interpolated target funded ratio for a given age."""
    maps = {
        "60": TARGET_FUNDED_RATIO_60PCT,
        "70": TARGET_FUNDED_RATIO_70PCT,
        "80": TARGET_FUNDED_RATIO_80PCT,
    }
    m = maps.get(success_level, TARGET_FUNDED_RATIO_70PCT)
    keys = sorted(m.keys())

    if age <= keys[0]:
        return m[keys[0]]
    if age >= keys[-1]:
        return m[keys[-1]]

    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= age <= hi:
            frac = (age - lo) / (hi - lo)
            return m[lo] + frac * (m[hi] - m[lo])
    return 1.0


def estimate_success_probability(funded_ratio: float, current_age: int) -> float:
    """
    Approximate probability of success from funded ratio and age.
    Derived from Exhibit 2 / Exhibit 4 relationships in Pittman (2015).
    Uses a sigmoid-style mapping calibrated to the paper's charts.
    """
    # Age-based scaling: younger investors have higher success for same FR
    age_factor = max(0.5, (70 - current_age) / 40)  # ranges ~0.5 to 1.125

    # Sigmoid centered around FR=1.0
    # At FR=1.0: ~70-75% success for age 66 (from Exhibit 2)
    # At FR=1.15: ~90% success for age 66
    x = (funded_ratio - 1.0) * 8 + age_factor * 1.5
    prob = 1 / (1 + math.exp(-x))

    # Clamp to realistic range
    return max(0.05, min(0.99, prob))


def funded_ratio_from_plan(
    accumulated_wealth: float,
    annual_spending: float,
    current_age: int,
    gender: str,
    human_capital: float = 0.0,
    income_assets_pv: float = 0.0,
    co_age=None,
    co_gender=None,
    real_yield_curve=None,
) -> dict:
    """
    Convenience wrapper — Pittman (2015) Eq. (3) and (4).
    Returns dict with funded_ratio, liability, surplus, max withdrawal rate.

    Example (Pittman Eq. 4):
        funded_ratio_from_plan(1_000_000, 50_000, 66, 'male') -> {'funded_ratio': ~1.11}
    """
    liability = actuarial_npv_spending(
        annual_spend=annual_spending,
        current_age=current_age,
        gender=gender,
        co_age=co_age,
        co_gender=co_gender,
        real_yield_curve=real_yield_curve,
    )
    total_assets = accumulated_wealth + human_capital + income_assets_pv
    fr = total_assets / liability if liability > 0 else 0.0
    af = annuity_factor(current_age, gender, real_yield_curve, co_age, co_gender)
    return {
        "funded_ratio": fr,
        "total_assets": total_assets,
        "liability": liability,
        "surplus_deficit": total_assets - liability,
        "annuity_factor": af,
        "max_withdrawal_rate": 1.0 / af if af > 0 else 0.0,
    }
