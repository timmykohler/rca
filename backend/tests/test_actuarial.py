"""
Test suite for the RCA Tool actuarial engine and API.

Run:  cd backend && pip install pytest httpx && pytest tests/ -v
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from engine.actuarial import (
    actuarial_npv_spending,
    actuarial_npv_income,
    human_capital_pv,
    after_tax_portfolio_value,
    annuity_factor,
    max_sustainable_withdrawal_rate,
    funded_ratio_from_plan,
    target_funded_ratio,
    estimate_success_probability,
    interpolate_yield,
    DEFAULT_REAL_YIELD_CURVE,
)


# ── Yield curve interpolation ─────────────────────────────────────────────────

class TestYieldInterpolation:
    def test_exact_term(self):
        r = interpolate_yield(10, DEFAULT_REAL_YIELD_CURVE)
        assert r == DEFAULT_REAL_YIELD_CURVE[10]

    def test_interpolated_between_terms(self):
        r = interpolate_yield(6, DEFAULT_REAL_YIELD_CURVE)
        lo = DEFAULT_REAL_YIELD_CURVE[5]
        hi = DEFAULT_REAL_YIELD_CURVE[7]
        assert lo <= r <= hi

    def test_clamp_short_end(self):
        r = interpolate_yield(0, DEFAULT_REAL_YIELD_CURVE)
        assert r == DEFAULT_REAL_YIELD_CURVE[min(DEFAULT_REAL_YIELD_CURVE)]

    def test_clamp_long_end(self):
        r = interpolate_yield(50, DEFAULT_REAL_YIELD_CURVE)
        assert r == DEFAULT_REAL_YIELD_CURVE[max(DEFAULT_REAL_YIELD_CURVE)]


# ── Actuarial NPV of spending — Pittman Eq. (1) ───────────────────────────────

class TestActuarialNPVSpending:
    """
    Pittman (2015) Example: 66-year-old male, $50,000/year real spending.
    Expected annuity cost ≈ $900,620 (paper used SOA 2000 + 2015 yield curve).
    We now use SSA 2022 Period Life Tables — lower mortality rates mean slightly
    higher PV (longer expected lifespan). Bounds allow for both table and yield
    curve differences from the paper's assumptions.
    """

    def test_pittman_dirk_example_order_of_magnitude(self):
        pv = actuarial_npv_spending(
            annual_spend=50_000,
            current_age=66,
            gender="male",
        )
        # Should be in the ballpark of $700k–$1.2M depending on yield curve
        assert 600_000 < pv < 1_500_000

    def test_higher_spending_proportional(self):
        pv1 = actuarial_npv_spending(50_000, 66, "male")
        pv2 = actuarial_npv_spending(100_000, 66, "male")
        assert abs(pv2 / pv1 - 2.0) < 0.01  # should be exactly 2x

    def test_older_client_lower_pv(self):
        pv_66 = actuarial_npv_spending(50_000, 66, "male")
        pv_80 = actuarial_npv_spending(50_000, 80, "male")
        assert pv_80 < pv_66  # older → fewer expected years → lower PV

    def test_female_slightly_higher_pv_than_male(self):
        pv_f = actuarial_npv_spending(50_000, 66, "female")
        pv_m = actuarial_npv_spending(50_000, 66, "male")
        assert pv_f > pv_m  # females have higher life expectancy

    def test_limited_end_age(self):
        pv_life = actuarial_npv_spending(50_000, 66, "female")
        pv_10yr = actuarial_npv_spending(50_000, 66, "female", start_age=66, end_age=76)
        assert pv_10yr < pv_life

    def test_zero_spending(self):
        pv = actuarial_npv_spending(0, 66, "male")
        assert pv == 0.0

    def test_joint_higher_than_single(self):
        pv_single = actuarial_npv_spending(50_000, 65, "male")
        pv_joint  = actuarial_npv_spending(50_000, 65, "male", co_age=63, co_gender="female")
        assert pv_joint > pv_single  # joint life → longer expected duration


# ── Human Capital — Pittman Eq. (2) ──────────────────────────────────────────

class TestHumanCapital:
    def test_basic_contributions(self):
        hc = human_capital_pv(
            annual_contribution=10_000,
            current_age=40,
            start_age=40,
            end_age=65,
        )
        # 25 years of $10k discounted — should be significantly less than $250k
        assert 100_000 < hc < 250_000

    def test_no_contributions(self):
        hc = human_capital_pv(0, 40, 40, 65)
        assert hc == 0.0

    def test_future_start_reduces_pv(self):
        hc_now  = human_capital_pv(10_000, 40, 40, 65)
        hc_late = human_capital_pv(10_000, 40, 55, 65)
        assert hc_late < hc_now


# ── After-tax portfolio value ─────────────────────────────────────────────────

class TestAfterTaxPortfolio:
    def test_roth_no_tax(self):
        at = after_tax_portfolio_value(100_000, 50_000, "roth_ira", 0.24, 0.15)
        assert at == 100_000

    def test_traditional_ira_full_tax(self):
        at = after_tax_portfolio_value(100_000, 0, "traditional_ira", 0.24, 0.15)
        assert abs(at - 76_000) < 1

    def test_taxable_gain_tax(self):
        # $100k value, $60k basis → $40k gain × 15% = $6k tax → $94k after-tax
        at = after_tax_portfolio_value(100_000, 60_000, "taxable", 0.24, 0.15)
        assert abs(at - 94_000) < 1

    def test_taxable_no_gain(self):
        at = after_tax_portfolio_value(100_000, 100_000, "taxable", 0.24, 0.15)
        assert at == 100_000

    def test_taxable_loss_no_negative_tax(self):
        # Basis > value → unrealized loss → no tax
        at = after_tax_portfolio_value(80_000, 100_000, "taxable", 0.24, 0.15)
        assert at == 80_000


# ── Annuity factor & withdrawal rate ─────────────────────────────────────────

class TestAnnuityFactor:
    """
    Pittman (2015) Eq. 9 example: couple aged 80/74 → annuity factor ≈ 13.65
    """

    def test_couple_80_74_factor(self):
        af = annuity_factor(80, "male", co_age=74, co_gender="female")
        # Paper states 13.65 using their 2015 yield curve; allow ±30% for different curve
        assert 8 < af < 20

    def test_older_lower_factor(self):
        af_66 = annuity_factor(66, "male")
        af_80 = annuity_factor(80, "male")
        assert af_80 < af_66

    def test_withdrawal_rate_inverse_of_factor(self):
        af = annuity_factor(66, "female")
        mwr = max_sustainable_withdrawal_rate(66, "female")
        assert abs(mwr - 1 / af) < 0.0001

    def test_couple_80_74_withdrawal_rate(self):
        mwr = max_sustainable_withdrawal_rate(80, "male", co_age=74, co_gender="female")
        # Should be in vicinity of 7.3% from paper Eq. 9
        assert 0.04 < mwr < 0.15


# ── Target funded ratio benchmarks ───────────────────────────────────────────

class TestTargetFundedRatio:
    def test_retirement_age_100pct(self):
        tfr = target_funded_ratio(65, "70")
        assert abs(tfr - 1.0) < 0.01

    def test_young_below_100pct(self):
        tfr = target_funded_ratio(25, "70")
        assert tfr < 1.0

    def test_higher_success_requires_higher_fr(self):
        tfr_70 = target_funded_ratio(40, "70")
        tfr_80 = target_funded_ratio(40, "80")
        assert tfr_80 > tfr_70

    def test_monotonic_increase_with_age(self):
        ages = [25, 30, 35, 40, 45, 50, 55, 60, 65]
        ratios = [target_funded_ratio(a, "70") for a in ages]
        assert all(ratios[i] <= ratios[i+1] for i in range(len(ratios)-1))


# ── Probability of success estimate ──────────────────────────────────────────

class TestSuccessProbability:
    def test_fully_funded_reasonable_probability(self):
        prob = estimate_success_probability(1.0, 66)
        assert 0.55 < prob < 0.90  # Exhibit 2: ~70-75% at FR=1.0 for age 66

    def test_higher_fr_higher_probability(self):
        p_100 = estimate_success_probability(1.00, 66)
        p_115 = estimate_success_probability(1.15, 66)
        p_130 = estimate_success_probability(1.30, 66)
        assert p_100 < p_115 < p_130

    def test_underfunded_low_probability(self):
        prob = estimate_success_probability(0.5, 66)
        assert prob < 0.40

    def test_probability_bounds(self):
        for fr in [0.1, 0.5, 1.0, 1.5, 2.0]:
            for age in [30, 50, 66, 80]:
                prob = estimate_success_probability(fr, age)
                assert 0.0 <= prob <= 1.0


# ── API integration test (requires running server) ────────────────────────────

class TestAPIIntegration:
    """
    These tests require the FastAPI server to be running.
    Run separately with: pytest tests/test_actuarial.py::TestAPIIntegration -v
    """

    @pytest.fixture
    def client(self):
        try:
            from fastapi.testclient import TestClient
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "main", os.path.join(os.path.dirname(__file__), "..", "main.py")
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return TestClient(mod.app)
        except ImportError:
            pytest.skip("FastAPI/httpx not installed")

    def test_calculate_endpoint(self, client):
        payload = {
            "investor_name": "Test Client",
            "investor_age": 66,
            "investor_gender": "male",
            "effective_income_tax_rate": 0.24,
            "long_term_gains_rate": 0.15,
            "portfolio_assets": [
                {"label": "IRA", "account_type": "traditional_ira", "present_value": 1_000_000, "cost_basis": 0}
            ],
            "spending_goals": [
                {"label": "Living", "annual_amount": 50_000}
            ],
        }
        resp = client.post("/api/calculate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "funded_ratio" in data
        assert "resources" in data
        assert "claims" in data
        assert data["funded_ratio"] > 0

    def test_calculate_pittman_dirk(self, client):
        """Reproduce Pittman (2015) Eq. 4: $1M assets / $900,620 liability ≈ 111%"""
        payload = {
            "investor_name": "Dirk",
            "investor_age": 66,
            "investor_gender": "male",
            "effective_income_tax_rate": 0.0,
            "long_term_gains_rate": 0.0,
            "portfolio_assets": [
                {"label": "Portfolio", "account_type": "roth_ira", "present_value": 1_000_000, "cost_basis": 0}
            ],
            "spending_goals": [
                {"label": "Living", "annual_amount": 50_000, "start_age": 66}
            ],
        }
        # Pin the yield curve so this test is deterministic regardless of what
        # FRED currently returns — otherwise the assertion drifts with the market.
        client.post("/api/yield-curve/override", json={
            "yields": {5: 0.002, 10: 0.009, 20: 0.016, 30: 0.019},
            "note": "pinned for Pittman (2015) reproduction",
        })
        try:
            resp = client.post("/api/calculate", json=payload)
            assert resp.status_code == 200
            data = resp.json()
            # Pittman states FR ≈ 111% for this case under 2015 yields
            # Allow ±20% for methodology differences
            assert 0.80 < data["funded_ratio"] < 1.50
        finally:
            client.delete("/api/yield-curve/override")

    def test_missing_spending_goals_422(self, client):
        payload = {
            "investor_name": "Test",
            "investor_age": 65,
            "investor_gender": "female",
            "effective_income_tax_rate": 0.24,
            "long_term_gains_rate": 0.15,
            "portfolio_assets": [
                {"label": "IRA", "account_type": "traditional_ira", "present_value": 500_000, "cost_basis": 0}
            ],
            "spending_goals": [],
        }
        resp = client.post("/api/calculate", json=payload)
        assert resp.status_code == 422
