"""
MoneyGuidePro XML Import — Real Household Schema
Confirmed against live MGP export (ExportInvestor.xml, March 2026).
Maps all available MGP fields to the expanded RCA PlanInput model.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
import xml.etree.ElementTree as ET
from datetime import date
import re

from models import (
    PlanInput, PortfolioAsset, SpendingGoal, SocialSecurity,
    RetirementIncome, PrivateAsset, Liability, FutureAsset,
    FutureSavings, AccountType, Gender, IncomeType,
    PrivateAssetType, LiabilityType, FutureAssetType,
    # legacy kept for compatibility
    Annuity, Pension, OtherIncomeAsset,
)

router = APIRouter(tags=["Import"])
CURRENT_YEAR = date.today().year

# ── MGP type code maps ────────────────────────────────────────────────────────

MGP_ACCT_MAP = {
    "401K":"401k","403B":"403b","457":"401k","PEMPPLAN":"401k",
    "PSPLAN":"401k","SEPIRA":"traditional_ira","SIMPIRA":"traditional_ira",
    "GOVTPLAN":"401k","IRA":"traditional_ira","ROLLIRA":"traditional_ira",
    "INHIRA":"traditional_ira","RIRA":"roth_ira","ROTH401K":"roth_401k",
    "ROTH403B":"roth_401k","TMGT":"taxable","INDIV":"taxable","JOINT":"taxable",
    "TOD":"taxable","TRUST":"taxable","529":"529","UGMA":"taxable",
    "ANNUITY":"taxable","NQDC":"deferred_comp","HSA":"other",
    "ULCV":"cash_value_life","VLCV":"cash_value_life",
    "WLCV":"cash_value_life","OLCV":"cash_value_life",
}

# MGP OtherAsset / NonInvestment type → our PrivateAssetType
MGP_ASSET_MAP = {
    "HOME":"home","REALESTATE":"real_estate","RENTAL":"real_estate",
    "BUSINESS":"business","CAR":"vehicle","VEHICLE":"vehicle",
    "BOAT":"vehicle","COLLECTIBLE":"collectible","PERSONAL":"personal",
    "ULCV":"cash_value_life","VLCV":"cash_value_life",
    "WLCV":"cash_value_life","OTHERCV":"cash_value_life",
}

# MGP Income source type → our IncomeType
MGP_INCOME_MAP = {
    "PENSION":"pension","DEFINEDBENEFIT":"pension","DB":"pension",
    "ANNUITY":"annuity","ANNUITYINCOME":"annuity",
    "RENTAL":"rental","RENTALINCOME":"rental",
    "ROYALTY":"royalties","ROYALTIES":"royalties",
    "PARTTIME":"part_time","PARTTIMEINCOME":"part_time","EMPLOYMENT":"part_time",
    "ALIMONY":"alimony",
    "TRUST":"trust_income","IRREVTRUST":"trust_income",
    "REVERSEMORTGAGE":"reverse_mortgage",
    "NQDCNOW":"deferred_comp_now","DEFERREDCOMP":"deferred_comp_now",
    "OTHER":"other","OTHERINCOME":"other",
}

# MGP Liability type → our LiabilityType
MGP_LIAB_MAP = {
    "MORTGAGE1":"mortgage_first","FIRSTMORTGAGE":"mortgage_first",
    "MORTGAGE2":"mortgage_second","SECONDMORTGAGE":"mortgage_second",
    "EQUITYLINE":"equity_line","HELOC":"equity_line",
    "CARLOAN":"auto_loan","AUTOLOAN":"auto_loan","BOATLOAN":"auto_loan",
    "BUSINESSLOAN":"business_loan","COMMERCIALMORTGAGE":"business_loan",
    "EQUIPMENT":"business_loan","WORKCAPITAL":"business_loan",
    "CREDITCARD":"credit_card","STUDENTLOAN":"student_loan",
    "PERSONALNOTE":"personal_note","LINEOFCREDIT":"personal_note",
    "MARGIN":"margin","TAXESOWED":"taxes_owed","SECURITIESLOAN":"margin",
    "OTHER":"other",
}

# MGP Future asset type → FutureAssetType
MGP_FUTURE_MAP = {
    "INHERITANCE":"inheritance","GIFT":"gift",
    "SETTLEMENT":"settlement","AWARD":"settlement",
    "DEATHBENEFIT":"death_benefit","LIFEINSURANCE":"death_benefit",
    "NQDCFUTURE":"deferred_comp","DEFERREDCOMP":"deferred_comp",
    "STOCKOPTION":"stock_award","RESTRICKEDSTOCK":"stock_award",
    "PERFORMANCESHARES":"stock_award","CASHAWARD":"stock_award",
    "OTHER":"other",
}

# MGP goal TypeId → spending grouping
MGP_GOAL_MAP = {
    "RETIREMENT":"essential","HEALTHCARE":"healthcare","HOMEIMPR":"housing",
    "COLLEGE":"discretionary","CAR":"discretionary","TRAVEL":"discretionary",
    "VACATION":"discretionary","OTHER":"discretionary","WEDDING":"discretionary",
    "CHARITY":"discretionary","BUSINESS":"discretionary",
}


def _strip(raw: str) -> str:
    raw = re.sub(r' xmlns[^=]*="[^"]*"', '', raw)
    raw = re.sub(r' xsi:[A-Za-z]+=\S+', '', raw)
    raw = re.sub(r'<xsi:[^>]+/?>', '', raw)
    return raw

def _t(el, path, default=""):
    n = el.find(path)
    return n.text.strip() if n is not None and n.text and n.text.strip() else default

def _f(v, d=0.0):
    try: return float(str(v).replace(",","").replace("$","").strip())
    except: return d

def _i(v, d=0):
    try: return int(float(str(v).strip()))
    except: return d

def _parse_dob(s):
    import time
    for fmt in ("%m/%d/%Y","%Y-%m-%d","%Y/%m/%d"):
        try: return date(*time.strptime(s, fmt)[:3])
        except: pass
    return None

def _age(s):
    d = _parse_dob(s); today = date.today()
    if not d: return None
    return today.year - d.year - ((today.month,today.day) < (d.month,d.day))

def _birth_yr(s):
    d = _parse_dob(s); return d.year if d else None

def _yr_age(year, by): return year - by
def _acct(code): return MGP_ACCT_MAP.get(code.upper().replace("-",""), "other")
def _owner(oid): return "co-investor" if oid == "2" else "investor"


@router.post("/import-xml")
async def import_mgp_xml(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".xml"):
        raise HTTPException(400, "File must be a .xml export from MoneyGuidePro.")
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    raw = _strip(raw.replace("\r\n","\n").replace("\r","\n"))
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise HTTPException(400, f"Invalid XML: {e}")
    try:
        return _parse(root)
    except Exception as e:
        raise HTTPException(422, f"Could not parse MGP file: {e}")


def _parse(root: ET.Element) -> dict:
    warnings = []

    # ── Participants ──────────────────────────────────────────────────────────
    participants = root.findall("Participants/Participant")
    if not participants:
        raise ValueError("No <Participant> elements found.")

    p1 = next((p for p in participants if p.get("ParticipantID")=="1"), participants[0])
    p2 = next((p for p in participants if p.get("ParticipantID")=="2"), None)

    inv_name  = f"{_t(p1,'FirstName')} {_t(p1,'LastName')}".strip() or "Unknown"
    inv_dob   = _t(p1,"DOB")
    inv_age   = _age(inv_dob) or 65
    inv_by    = _birth_yr(inv_dob) or (CURRENT_YEAR - inv_age)
    inv_sex   = _t(p1,"Sex")
    inv_gender = Gender.female if inv_sex == "2" else Gender.male

    has_co = p2 is not None
    co_name = co_age = co_gender = co_by = None
    if has_co:
        co_name   = f"{_t(p2,'FirstName')} {_t(p2,'LastName')}".strip() or None
        co_dob    = _t(p2,"DOB")
        co_age    = _age(co_dob) or None
        co_by     = _birth_yr(co_dob) or (CURRENT_YEAR - (co_age or 60))
        co_sex    = _t(p2,"Sex")
        co_gender = Gender.female if co_sex == "2" else Gender.male

    # ── Tax rates ─────────────────────────────────────────────────────────────
    income_tax = _f(_t(root,"IncomeTaxRate") or _t(root,"FederalTaxRate"), 24)
    if income_tax > 1: income_tax /= 100
    ltcg = _f(_t(root,"CapitalGainsTaxRate") or _t(root,"LTCGRate"), 15)
    if ltcg > 1: ltcg /= 100
    warnings.append(
        "Tax rates not found in MGP export — defaulted to "
        f"{income_tax:.0%} income / {ltcg:.0%} LTCG. Please update before evaluating."
    )

    # ── Investment accounts ───────────────────────────────────────────────────
    portfolio_assets = []
    for a in root.findall("Assets/InvestmentAssets/InvestmentAsset"):
        val   = _f(_t(a,"CurrentValue"))
        basis = _f(_t(a,"CostBasis"))
        if val <= 0: continue
        portfolio_assets.append(PortfolioAsset(
            label=_t(a,"Description") or "Account",
            account_type=_acct(_t(a,"Type")),
            present_value=val, cost_basis=basis,
        ))

    # ── Physical / non-investment assets ──────────────────────────────────────
    private_assets = []

    # OtherAssets section
    for a in root.findall("Assets/OtherAssets/OtherAsset") or []:
        val  = _f(_t(a,"CurrentValue") or _t(a,"Value"))
        if val <= 0: continue
        raw_type = _t(a,"Type","").upper()
        at = MGP_ASSET_MAP.get(raw_type, "other")
        private_assets.append(PrivateAsset(
            label=_t(a,"Description") or "Asset",
            asset_type=at, value=val,
            cost_basis=_f(_t(a,"CostBasis")),
            debt_owed=_f(_t(a,"Mortgage") or _t(a,"Debt")),
            tax_rate=ltcg,
        ))

    # Real estate shortcut (some MGP exports use separate node)
    for r in root.findall("Assets/RealEstate") or []:
        val = _f(_t(r,"CurrentValue") or _t(r,"Value"))
        if val <= 0: continue
        private_assets.append(PrivateAsset(
            label=_t(r,"Description") or _t(r,"Name") or "Real Estate",
            asset_type="real_estate", value=val,
            cost_basis=_f(_t(r,"CostBasis")),
            debt_owed=_f(_t(r,"Mortgage") or _t(r,"Debt")),
            tax_rate=ltcg,
        ))

    # Cash value life insurance
    for a in root.findall("Assets/InvestmentAssets/InvestmentAsset"):
        at = _t(a,"Type","").upper()
        if at in ("ULCV","VLCV","WLCV","OLCV","OTHERCV"):
            val = _f(_t(a,"CurrentValue"))
            if val > 0:
                private_assets.append(PrivateAsset(
                    label=_t(a,"Description") or "Cash Value Life",
                    asset_type="cash_value_life", value=val,
                    cost_basis=_f(_t(a,"CostBasis")), debt_owed=0, tax_rate=0,
                ))

    # ── Goal plan ─────────────────────────────────────────────────────────────
    gp = root.find("GoalPlans/GoalPlan")
    base_inf = 0.024
    if gp is not None:
        bi = _t(gp,"CurrentAllocation/BaseInflationRate")
        if bi: base_inf = _f(bi, 0.024)

    spending_goals = []
    retirement_income = []
    social_security   = []
    liabilities       = []
    future_assets     = []
    future_savings    = []

    if gp is not None:

        # ── Spending goals ────────────────────────────────────────────────────
        ret = gp.find("GoalDetails/RetirementGoal")
        if ret is not None:
            for bucket in ret.findall("ExpenseBuckets/ExpenseBucket"):
                amt  = _f(_t(bucket,"Amount"))
                freq = _t(bucket,"Frequency","Annual").lower()
                sy   = _i(_t(bucket,"StartYear"))
                ey   = _i(_t(bucket,"EndYear"))
                if amt <= 0: continue
                annual = amt * 12 if "month" in freq else amt
                sa = _yr_age(sy, inv_by) if sy else None
                ea = _yr_age(ey, inv_by) if ey else None
                desc = _t(bucket,"Description","")
                label_map = {
                    "BothRetired":"Retirement — Both Living",
                    "ClientDeadCoClientRetired":"Retirement — Survivor (Co-Investor)",
                    "CoClientDeadClientRetired":"Retirement — Survivor (Investor)",
                }
                label = label_map.get(desc, f"Retirement — {desc}" if desc else "Retirement Living Expense")
                if "month" in freq:
                    warnings.append(f"'{label}': MGP stores as ${amt:,.0f}/month — annualized to ${annual:,.0f}/year.")
                spending_goals.append(SpendingGoal(
                    label=label, grouping="essential",
                    annual_amount=round(annual, 2),
                    annual_adjustment=base_inf,
                    start_age=sa, end_age=ea,
                ))

        for g in gp.findall("GoalDetails/GoalsOther/GoalOther"):
            amt  = _f(_t(g,"ExpenseAmount"))
            tid  = _t(g,"TypeId","OTHER").upper()
            sy   = _i(_t(g,"StartYear"))
            ey   = _i(_t(g,"EndYear") or _t(g,"EndYr"))
            if amt <= 0: continue
            grp  = MGP_GOAL_MAP.get(tid,"discretionary")
            sa   = _yr_age(sy,inv_by) if sy else None
            ea   = _yr_age(ey,inv_by) if ey else None
            spending_goals.append(SpendingGoal(
                label=_t(g,"Description") or "Goal",
                grouping=grp, annual_amount=round(amt,2),
                annual_adjustment=base_inf if grp in ("essential","healthcare") else 0.0,
                start_age=sa, end_age=ea,
            ))

        # ── Social Security ───────────────────────────────────────────────────
        for ss_el in (gp.findall("Incomes/SocialSecurityBenefit") or
                      gp.findall("SocialSecurityBenefits/SocialSecurityBenefit") or []):
            amt  = _f(_t(ss_el,"Benefit") or _t(ss_el,"Amount"))
            if amt <= 0: continue
            oid  = _t(ss_el,"Owner")
            by_r = inv_by if oid != "2" else (co_by or inv_by)
            sy   = _i(_t(ss_el,"StartYear"))
            sa   = _yr_age(sy,by_r) if sy > 1000 else (sy or 67)
            cola = _f(_t(ss_el,"COLA"), base_inf)
            if cola > 1: cola /= 100
            social_security.append(SocialSecurity(
                label=f"Social Security ({_owner(oid).replace('-',' ').title()})",
                owner=_owner(oid), annual_amount=amt,
                annual_adjustment=cola, start_age=sa,
            ))

        # ── Retirement Income (pensions, annuities, other) ────────────────────
        # Pensions
        for p in (gp.findall("Incomes/Pension") or
                  gp.findall("Pensions/Pension") or []):
            amt = _f(_t(p,"Amount") or _t(p,"AnnualBenefit"))
            if amt <= 0: continue
            oid  = _t(p,"Owner")
            by_r = inv_by if oid != "2" else (co_by or inv_by)
            sy   = _i(_t(p,"StartYear"))
            sa   = _yr_age(sy,by_r) if sy > 1000 else (sy or 65)
            surv = _f(_t(p,"SurvivorBenefit") or _t(p,"SurvivorPercentage"),0)
            if surv > 1: surv /= 100
            retirement_income.append(RetirementIncome(
                label=_t(p,"Description") or "Pension",
                income_type=IncomeType.pension, owner=_owner(oid),
                annual_amount=amt, annual_adjustment=0.0, start_age=sa,
                survivorship=surv > 0, survivorship_percentage=surv or 0.5,
            ))

        # Annuities
        for a in (gp.findall("Incomes/Annuity") or
                  gp.findall("Annuities/Annuity") or []):
            amt = _f(_t(a,"AnnualIncome") or _t(a,"Amount"))
            if amt <= 0: continue
            oid = _t(a,"Owner")
            sy  = _i(_t(a,"StartYear"))
            sa  = _yr_age(sy, inv_by if oid != "2" else (co_by or inv_by)) if sy > 1000 else (sy or 65)
            retirement_income.append(RetirementIncome(
                label=_t(a,"Name") or _t(a,"Description") or "Annuity",
                income_type=IncomeType.annuity, owner=_owner(oid),
                annual_amount=amt, start_age=sa,
            ))

        # Other income sources
        for oi in (gp.findall("Incomes/OtherIncome") or
                   gp.findall("OtherIncomes/OtherIncome") or []):
            amt = _f(_t(oi,"Amount") or _t(oi,"AnnualAmount"))
            if amt <= 0: continue
            oid  = _t(oi,"Owner")
            sy   = _i(_t(oi,"StartYear"))
            ey   = _i(_t(oi,"EndYear"))
            by_r = inv_by if oid != "2" else (co_by or inv_by)
            sa   = _yr_age(sy,by_r) if sy > 1000 else (sy or None)
            ea   = _yr_age(ey,by_r) if ey > 1000 else (ey or None)
            raw_type = _t(oi,"TypeId","").upper() or _t(oi,"Type","").upper()
            inc_type = MGP_INCOME_MAP.get(raw_type, "other")
            retirement_income.append(RetirementIncome(
                label=_t(oi,"Description") or raw_type or "Other Income",
                income_type=inc_type, owner=_owner(oid),
                annual_amount=amt, start_age=sa, end_age=ea,
            ))

        # ── Liabilities ───────────────────────────────────────────────────────
        def _parse_liab(el):
            bal = _f(_t(el,"Balance") or _t(el,"CurrentBalance") or _t(el,"Amount"))
            if bal <= 0: return None
            raw_t = _t(el,"Type","").upper()
            lt = MGP_LIAB_MAP.get(raw_t, "other")
            return Liability(
                label=_t(el,"Description") or _t(el,"Name") or raw_t or "Liability",
                liability_type=lt, balance=bal,
                monthly_payment=_f(_t(el,"MonthlyPayment") or _t(el,"Payment")),
                interest_rate=_f(_t(el,"InterestRate") or _t(el,"Rate")) / 100
                    if _f(_t(el,"InterestRate") or _t(el,"Rate")) > 1
                    else _f(_t(el,"InterestRate") or _t(el,"Rate")),
            )

        for section in ["Liabilities","HomeLoans","VehicleLoans","BusinessLoans","OtherLoans"]:
            for liab_el in root.findall(f"{section}/Liability") or root.findall(f"{section}/Loan") or []:
                l = _parse_liab(liab_el)
                if l: liabilities.append(l)

        # Also grab mortgage from real estate entries
        for r in root.findall("Assets/RealEstate") or []:
            mtg = _f(_t(r,"Mortgage") or _t(r,"Debt"))
            if mtg > 0:
                liabilities.append(Liability(
                    label=f"Mortgage — {_t(r,'Description') or _t(r,'Name') or 'Property'}",
                    liability_type="mortgage_first", balance=mtg,
                ))

        # ── Future assets ─────────────────────────────────────────────────────
        for fa_el in (gp.findall("FutureAssets/FutureAsset") or
                      root.findall("Assets/FutureAssets/FutureAsset") or []):
            amt = _f(_t(fa_el,"Amount") or _t(fa_el,"Value"))
            if amt <= 0: continue
            raw_t = _t(fa_el,"Type","").upper()
            ft    = MGP_FUTURE_MAP.get(raw_t, "other")
            oid   = _t(fa_el,"Owner")
            sy    = _i(_t(fa_el,"Year") or _t(fa_el,"StartYear"))
            by_r  = inv_by if oid != "2" else (co_by or inv_by)
            ea    = _yr_age(sy, by_r) if sy > 1000 else (sy or inv_age + 10)
            future_assets.append(FutureAsset(
                label=_t(fa_el,"Description") or raw_t or "Future Asset",
                asset_type=ft, owner=_owner(oid),
                amount=amt, expected_age=max(inv_age+1, ea),
                tax_rate=ltcg,
            ))

        # ── Employer awards (stock options, restricted stock) ─────────────────
        for award in (gp.findall("EmployerAwards/Award") or
                      root.findall("Assets/StockOptions/StockOption") or []):
            val = _f(_t(award,"Value") or _t(award,"CurrentValue"))
            if val <= 0: continue
            raw_t = _t(award,"Type","").upper()
            ft    = MGP_FUTURE_MAP.get(raw_t, "stock_award")
            sy    = _i(_t(award,"VestYear") or _t(award,"Year"))
            ea    = _yr_age(sy, inv_by) if sy > 1000 else inv_age + 3
            future_assets.append(FutureAsset(
                label=_t(award,"Description") or "Employer Award",
                asset_type=ft, owner="investor",
                amount=val, expected_age=max(inv_age+1, ea),
                tax_rate=ltcg,
            ))

        # ── Future savings (contributions) ────────────────────────────────────
        for fs_el in (gp.findall("FutureSavings/FutureSaving") or
                      gp.findall("Contributions/Contribution") or []):
            amt = _f(_t(fs_el,"AnnualAmount") or _t(fs_el,"Amount"))
            if amt <= 0: continue
            oid  = _t(fs_el,"Owner")
            sy   = _i(_t(fs_el,"StartAge") or _t(fs_el,"StartYear"))
            ey   = _i(_t(fs_el,"RetirementAge") or _t(fs_el,"EndYear") or _t(fs_el,"EndAge"))
            by_r = inv_by if oid != "2" else (co_by or inv_by)
            sa   = _yr_age(sy, by_r) if sy > 1000 else (sy or inv_age)
            ea   = _yr_age(ey, by_r) if ey > 1000 else (ey or 65)
            fs_type_str = (_t(fs_el,"Type") or "pre-tax").lower()
            fs_type = "roth" if "roth" in fs_type_str else ("taxable" if "taxable" in fs_type_str else "pre-tax")
            future_savings.append(FutureSavings(
                label=_t(fs_el,"Name") or _t(fs_el,"Description") or "Future Savings",
                savings_type=fs_type, owner=_owner(oid),
                annual_contribution=amt, annual_adjustment=0.0,
                start_age=sa, end_age=max(sa+1, ea),
            ))

        # ── Employment income → estimated savings ─────────────────────────────
        for pidx, p in enumerate(participants):
            inc    = _f(_t(p,"EmploymentIncome"))
            status = _t(p,"EmploymentStatus")
            if inc > 0 and status in ("1","2","3"):
                fname = _t(p,"FirstName")
                oid   = p.get("ParticipantID","1")
                by_r  = inv_by if oid != "2" else (co_by or inv_by)
                c_age = CURRENT_YEAR - by_r
                ret_yr = by_r + 65
                e_age  = _yr_age(ret_yr, by_r)
                contrib = inc * 0.15
                future_savings.append(FutureSavings(
                    label=f"Estimated Savings ({fname})",
                    savings_type="pre-tax", owner=_owner(oid),
                    annual_contribution=round(contrib,2),
                    annual_adjustment=0.0,
                    start_age=c_age, end_age=max(c_age+1, e_age),
                ))
                warnings.append(
                    f"Future savings for {fname} estimated at 15% of employment income "
                    f"(${inc:,.0f}). Please review and adjust."
                )

    plan = PlanInput(
        description=_t(gp,"Description") if gp is not None else "Imported from MoneyGuidePro",
        investor_name=inv_name, investor_dob=inv_dob,
        investor_age=inv_age, investor_gender=inv_gender,
        has_co_investor=has_co, co_investor_name=co_name,
        co_investor_age=co_age, co_investor_gender=co_gender,
        effective_income_tax_rate=income_tax, long_term_gains_rate=ltcg,
        portfolio_assets=portfolio_assets, spending_goals=spending_goals,
        social_security=social_security, retirement_income=retirement_income,
        private_assets=private_assets, liabilities=liabilities,
        future_assets=future_assets, future_savings=future_savings,
        annuities=[], pensions=[], other_income=[],
    )

    result = plan.model_dump()
    result["_warnings"] = warnings
    result["_import_notes"] = {
        "base_inflation_rate": base_inf,
        "investor_birth_year": inv_by,
        "co_birth_year": co_by,
        "year_to_age_note": "StartYear/EndYear converted to ages via birth year from DOB.",
    }
    return result
