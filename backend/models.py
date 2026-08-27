from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum


class AccountType(str, Enum):
    taxable         = "taxable"
    traditional_ira = "traditional_ira"
    roth_ira        = "roth_ira"
    k401            = "401k"
    k403b           = "403b"
    roth_401k       = "roth_401k"
    deferred_comp   = "deferred_comp"
    cash_value_life = "cash_value_life"
    k529            = "529"
    other           = "other"


class Gender(str, Enum):
    male   = "male"
    female = "female"


# ── Income-producing asset type — drives UI grouping ──────────────────────────
class IncomeType(str, Enum):
    pension           = "pension"
    annuity           = "annuity"
    royalties         = "royalties"
    rental            = "rental"
    part_time         = "part_time"
    alimony           = "alimony"
    trust_income      = "trust_income"
    reverse_mortgage  = "reverse_mortgage"
    deferred_comp_now = "deferred_comp_now"
    other             = "other"


# ── Physical / non-investable asset type ─────────────────────────────────────
class PrivateAssetType(str, Enum):
    home            = "home"
    real_estate     = "real_estate"
    business        = "business"
    vehicle         = "vehicle"
    collectible     = "collectible"
    personal        = "personal"
    cash_value_life = "cash_value_life"
    other           = "other"


# ── Liability type ────────────────────────────────────────────────────────────
class LiabilityType(str, Enum):
    mortgage_first   = "mortgage_first"
    mortgage_second  = "mortgage_second"
    equity_line      = "equity_line"
    auto_loan        = "auto_loan"
    business_loan    = "business_loan"
    credit_card      = "credit_card"
    student_loan     = "student_loan"
    personal_note    = "personal_note"
    margin           = "margin"
    taxes_owed       = "taxes_owed"
    other            = "other"


# ── Future asset type ─────────────────────────────────────────────────────────
class FutureAssetType(str, Enum):
    inheritance   = "inheritance"
    gift          = "gift"
    settlement    = "settlement"
    death_benefit = "death_benefit"
    deferred_comp = "deferred_comp_future"
    stock_award   = "stock_award"
    other         = "other"


# ─── Input models ─────────────────────────────────────────────────────────────

class PortfolioAsset(BaseModel):
    account_number: Optional[str] = ""
    label: str
    account_type: AccountType
    present_value: float = Field(ge=0)
    cost_basis: float = Field(ge=0, default=0)


class SpendingGoal(BaseModel):
    label: str
    grouping: Optional[str] = "essential"
    annual_amount: float = Field(ge=0)
    annual_adjustment: float = 0.0
    start_age: Optional[int] = None
    end_age: Optional[int] = None


class SocialSecurity(BaseModel):
    label: str
    owner: Literal["investor", "co-investor"]
    annual_amount: float = Field(ge=0)
    annual_adjustment: float = 0.023
    start_age: int


class RetirementIncome(BaseModel):
    """
    Unified model for all recurring income streams that are valued as
    resources via actuarial NPV (Eq. 1). Replaces the old split between
    Annuity, Pension, and OtherIncomeAsset.
    """
    label: str
    income_type: IncomeType = IncomeType.other
    owner: Literal["investor", "co-investor"] = "investor"
    annual_amount: float = Field(ge=0)
    annual_adjustment: float = 0.0
    start_age: Optional[int] = None
    end_age: Optional[int] = None          # None = life (actuarial)
    survivorship: bool = False
    survivorship_percentage: float = 0.0


# Keep old types as aliases for backwards compat with existing XML importer
class Annuity(BaseModel):
    label: str
    owner: Literal["investor", "co-investor"]
    annual_amount: float = Field(ge=0)
    survivorship: bool = True
    survivorship_percentage: float = 0.50
    annual_adjustment: float = 0.0
    start_age: int


class Pension(BaseModel):
    label: str
    owner: Literal["investor", "co-investor"]
    annual_amount: float = Field(ge=0)
    survivorship: bool = True
    survivorship_percentage: float = 0.50
    annual_adjustment: float = 0.0
    start_age: int


class OtherIncomeAsset(BaseModel):
    label: str
    owner: Literal["investor", "co-investor"]
    earned_income: bool = False
    annual_amount: float = Field(ge=0)
    discount_rate: Optional[float] = None
    annual_adjustment: float = 0.0
    start_age: Optional[int] = None
    end_age: Optional[int] = None


class PrivateAsset(BaseModel):
    label: str
    asset_type: PrivateAssetType = PrivateAssetType.other
    value: float = Field(ge=0)
    cost_basis: float = Field(ge=0, default=0)
    debt_owed: float = Field(ge=0, default=0)
    tax_rate: float = 0.0


class Liability(BaseModel):
    """Standalone liability — reduces net worth in FR calculation."""
    label: str
    liability_type: LiabilityType = LiabilityType.other
    balance: float = Field(ge=0)
    monthly_payment: float = Field(ge=0, default=0)
    interest_rate: float = Field(ge=0, default=0)


class FutureAsset(BaseModel):
    """
    One-time future cash inflow (inheritance, settlement, stock vesting, etc.).
    Discounted to PV and added to Resources.
    """
    label: str
    asset_type: FutureAssetType = FutureAssetType.other
    owner: Literal["investor", "co-investor"] = "investor"
    amount: float = Field(ge=0)
    expected_age: int = Field(ge=0, le=100)   # age of investor when received
    tax_rate: float = Field(ge=0, default=0)  # tax on receipt


class FutureSavings(BaseModel):
    label: str
    savings_type: Literal["pre-tax", "roth", "taxable", "other"] = "pre-tax"
    owner: Literal["investor", "co-investor"]
    annual_contribution: float = Field(ge=0)
    annual_adjustment: float = 0.0
    start_age: int
    end_age: int


class PlanInput(BaseModel):
    description: Optional[str] = ""

    # ── Investor ──────────────────────────────────────────────────────────────
    investor_name: str
    investor_dob: Optional[str] = None
    investor_age: int = Field(ge=18, le=100)
    investor_gender: Gender
    gm_link: Optional[str] = ""

    has_co_investor: bool = False
    co_investor_name: Optional[str] = None
    co_investor_dob: Optional[str] = None
    co_investor_age: Optional[int] = None
    co_investor_gender: Optional[Gender] = None

    # ── Tax ───────────────────────────────────────────────────────────────────
    effective_income_tax_rate: float = Field(ge=0, le=1)
    long_term_gains_rate: float = Field(ge=0, le=1)

    # ── Investment accounts ───────────────────────────────────────────────────
    portfolio_assets: List[PortfolioAsset] = []

    # ── Claims ────────────────────────────────────────────────────────────────
    spending_goals: List[SpendingGoal] = []

    # ── Income sources ────────────────────────────────────────────────────────
    social_security: List[SocialSecurity] = []
    retirement_income: List[RetirementIncome] = []   # NEW unified list

    # Legacy fields — kept for XML importer compatibility
    annuities: List[Annuity] = []
    pensions: List[Pension] = []
    other_income: List[OtherIncomeAsset] = []

    # ── Assets ────────────────────────────────────────────────────────────────
    private_assets: List[PrivateAsset] = []          # now typed
    future_assets: List[FutureAsset] = []            # NEW

    # ── Savings & liabilities ─────────────────────────────────────────────────
    future_savings: List[FutureSavings] = []
    liabilities: List[Liability] = []                # NEW


# ─── Output models ────────────────────────────────────────────────────────────

class ResourcesBreakdown(BaseModel):
    portfolio_after_tax: float
    private_assets_net: float
    liabilities_total: float
    social_security_pv: float
    retirement_income_pv: float   # unified
    pension_pv: float             # legacy
    annuity_pv: float             # legacy
    other_income_pv: float        # legacy
    future_assets_pv: float
    human_capital_pv: float
    total_resources: float


class ClaimsBreakdown(BaseModel):
    spending_goals: List[dict]
    total_claims: float


class FundedRatioResult(BaseModel):
    funded_ratio: float
    funded_ratio_pct: float
    surplus_deficit: float
    resources: ResourcesBreakdown
    claims: ClaimsBreakdown
    probability_of_success: float
    target_funded_ratio_70: float
    target_funded_ratio_80: float
    max_sustainable_withdrawal_rate: float
    annuity_factor: float
    status: Literal["overfunded", "fully_funded", "at_risk", "underfunded"]
    status_message: str
    investor_name: str
    description: str
    investor_age: int
