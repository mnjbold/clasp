# GWAS Resource Checklist

Use this once per environment before deployment. The committed template lives in `gwas/resources.local.example.json`. Copy it to `gwas/resources.local.json`, fill the remaining blanks, then run `node .\gwas\tools\preflight.mjs`.

## Known Workspace Resources

| Item | Value |
|---|---|
| Team Registry spreadsheet | `1CTOaK7Kt2s6nF4ljVNejDC_LKkNjCqZQum2zQCTAU5U` |
| Master Dashboard spreadsheet | `1UoY81SPitbN7y2yYuP5g5cy6bJS1xltfU2PAXMiTwgI` |
| Task Tracker spreadsheet | `12Y7EoiSgTa-G8MUHIWwvTf2ZnBGI7sjaYRcVIdsnAL4` |
| Projects spreadsheet | `1e8fwRlrh8VaHvZruuzArB5HY77vG_uss8u6M4mpTJT8` |
| Knowledge Base spreadsheet | `1wEceEo7zaEzf7kvKUuUlGLHtmXfeZKOVBacMy5jKE40` |
| System Log spreadsheet | `1zJaUAn5ahpr4-lMfBUrzNM4jlOtdD8uzrDK7NHQYbZQ` |
| Team Drive root folder | `1SXJKH0RZF-wgKCKgh4yg7rluZP-5gQLz` |
| Projects subfolder | `19DQUYItP1LHSIxe6e3JmQNxfgB60DkPS` |
| Main team Chat space | `AAQAN9ONUtA` |
| Approvals Chat space | `AAQAsgmMlkc` |

## Still Required Before Full Rollout

| Item | Where it is used |
|---|---|
| TypeScript deployment strategy | All modules; raw `clasp push` is currently failing on TypeScript-only syntax |
| Library Script ID | All module `appsscript.json` files |
| Library version | All module `appsscript.json` files |
| Script ID for each module | Each module `.clasp.json` and `gwas/clasp.config.json` |
| `GEMINI_API_KEY` | Shared library script properties |
| Module 03 `APPROVAL_CALLBACK_URL` | Approval cards and extracted actions |
| Module 03 monitored Chat spaces | Chat scanning |
| Module 09 deployment ID | Google Chat API configuration |

## Validation Flow

1. Copy `gwas/resources.local.example.json` to `gwas/resources.local.json`.
2. Fill the remaining non-secret deployment values.
3. Keep the Gemini API key in Apps Script Script Properties only.
4. Run `node .\gwas\tools\preflight.mjs`.
5. Fix every reported error before any `clasp push`.