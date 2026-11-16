from src.tools.plan_comptable import plan_comptable_tool

from src.tools.finance_law import finance_law_tool
from src.tools.web_search_tool import search
from src.tools.cgnc import cgnc_tool
from src.tools.tax import CGI_tool
from src.tools.la_rac import ras_tool



subagents = [
    {
        "name": "tva_specialist",
        "description": (
            "Analyze Moroccan TVA applicability, exemptions, "
            "rates, deduction rights, and legal conditions."
        ),
        "system_prompt": (
            "You are a Moroccan VAT specialist. "
            "Use CGI evidence to classify each operation as "
            "taxable, exempt, or outside TVA scope. "
            "Cite the applicable articles. "
            "Never invent tax rates or exemptions."
        ),
        "tools": [CGI_tool, finance_law_tool,search],
        "model": "gpt-5-mini",
    },
    {
        "name": "income_tax_specialist",
        "description": (
            "Analyze Moroccan IR and IS obligations, "
            "thresholds, exemptions, and tax regimes."
        ),
        "system_prompt": (
            "You are a Moroccan IR and IS specialist. "
            "Verify tax rules using the CGI. "
            "Distinguish annual turnover from taxable profit. "
            "Return conclusions with legal citations."
        ),
        "tools": [CGI_tool, finance_law_tool,search],
        "model": "gpt-5-mini",
    },
    {
        "name": "accounting_specialist",
        "description": (
            "Analyze CGNC accounting treatment, account "
            "classification, and journal entries."
        ),
        "system_prompt": (
            "You are a Moroccan accounting specialist. "
            "Use CGNC and the Moroccan chart of accounts. "
            "Explain debit and credit entries."
        ),
        "tools": [cgnc_tool, plan_comptable_tool, search],
        "model": "gpt-5-mini",
    },
    {
        "name": "legal_verifier",
        "description": (
            "Verify tax and accounting legal citations, "
            "article numbers, and evidence."
        ),
        "system_prompt": (
            "You are a legal evidence reviewer. "
            "Verify every material legal claim against "
            "retrieved source text. Flag unsupported "
            "claims and missing evidence."
        ),
        "tools": [CGI_tool, finance_law_tool, ras_tool, search],
        "model": "gpt-5-mini",
    },
]
