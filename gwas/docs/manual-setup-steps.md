# GWAS — Manual Setup Steps

All code is deployed. These are the one-time manual steps to complete setup.
Each step takes ~10 seconds: open the link → pick the function → click Run.

---

## Step A — Set Script Properties + run library setup (same script, 2 runs)

Open: https://script.google.com/d/1lqCse5yiXgmC3T05YfYCaHgkpRoo5zLepeTRrMwlek2L7ILgrMaLNBP0/edit

1. In the file selector on the left, open `_setProperties`
2. Select function **`setAllProperties`** in the dropdown → click **Run**
   - This sets all 11 Script Properties (Gemini API key, all spreadsheet IDs, Chat space IDs)
   - You will be asked to authorize the script — click **Allow**
3. Switch to file `index` → Select function **`setupLibrary`** → click **Run**
   - This seeds config keys and creates the Team Registry sheet structure

After running both, delete `_setProperties` from the editor (it contains the API key).

---

## Step B — Module setup functions

Open each URL, pick the function, click Run. One click per tab.

| # | Function | Script Editor URL |
|---|---|---|
| 1 | `setupDashboard` | https://script.google.com/d/1IwbdNlDiIzFr-FNCGBdU7Q6gIk4VBWH1aH8wpD2dtMHvQ6eU5g41vPC9/edit |
| 2 | `setupCalendarAutomation` | https://script.google.com/d/1ed3nRX4ZVFD7IJ7nMNarTbvQ1ymEeHF6sL_pIOPb7iNhLta7Mi5xZMdc/edit |
| 3 | `setupMeetingNotes` | https://script.google.com/d/1SBFCUAp1lt2pRlnGMk5Bc9vm6fbB3xd0K5BkNx--4g1zBKzbmKXLowKU/edit |
| 4 | `setupTaskTracker` | https://script.google.com/d/16djnGsv5Q2jOHEqq68-9H5aLpqEtQoC0p-OJmIrUHNkmDIx7g3jQ691N/edit |
| 5 | `setupProjectsSheet` | https://script.google.com/d/1B8FbqQoHNWWoe_hTgHo0FJuyzg-epovpKiCHNe4TWJasMI-77UlPB4jt/edit |
| 6 | `setupDigest` | https://script.google.com/d/1r4bcxdcfYnMALQiWZTQXDAIxEnVbiO0Uv-dxEPZ-L-IxKBjbOdYZ1JBO/edit |
| 7 | `setupKnowledgeBase` | https://script.google.com/d/1CfauDvnHdmHPMfBqvpLbnanQCiDfmLK7TqlKVop22uGqJ628x4HCPQTi/edit |
| 8 | `setupReporting` | https://script.google.com/d/1cz13dpSI8yfqZ6CdmKyo772eFi45cSmfTuQ69ZnCvnhBkVKQrXJH4ObW/edit |

Each setup function creates the required sheet tabs and installs time-based triggers.

---

## Step C — Module 03 additional properties

After running `setupMeetingNotes`, set these 2 extra Script Properties in Module 03:

URL: https://script.google.com/d/1SBFCUAp1lt2pRlnGMk5Bc9vm6fbB3xd0K5BkNx--4g1zBKzbmKXLowKU/edit

1. **Project Settings → Script Properties → Add property:**
   - `APPROVAL_CALLBACK_URL` → (the web app deployment URL for Module 03, set after deploying as Web App)
   - `MONITORED_CHAT_SPACE_IDS` → `spaces/AAQAN9ONUtA,spaces/AAQAsgmMlkc`

2. **Deploy Module 03 as a Web App:**
   - Deploy → New deployment → Web app
   - Execute as: **Me**, Access: **Anyone in your domain**
   - Copy the URL → paste as `APPROVAL_CALLBACK_URL` property

---

## Step D — Module 09 (Admin Chat App)

1. Open: https://script.google.com/d/10_WjlK1cPqxmzz-i7iwwYw3aky8uD3VifgcQVx0rJqvT5qAXJ1HOaE/edit
2. Run `getSetupInstructions()` — it outputs the full Chat API config guide to the Execution Log
3. Deploy as Web App → copy the Deployment ID
4. Go to Google Cloud Console → APIs & Services → Google Chat API → Configuration:
   - App name: `GWAS Assistant`
   - Connection: Apps Script → paste Deployment ID
   - Add slash commands (IDs 1–9 as per README)
   - Publish to domain

---

## Step E — Add team members

Open the Team Registry spreadsheet:  
https://docs.google.com/spreadsheets/d/1CTOaK7Kt2s6nF4ljVNejDC_LKkNjCqZQum2zQCTAU5U/edit

Fill in the **Team** sheet with your team's details:

| Email | Name | Chat User ID | Chat DM Space ID | Role | Timezone |
|---|---|---|---|---|---|
| you@domain.com | Your Name | users/123 | spaces/ABC | lead | America/New_York |

---

## Status

- ✅ Library compiled + pushed (9 files)
- ✅ All 9 modules compiled + pushed
- ✅ Script Properties file deployed to lib (run `setAllProperties` to activate)
- ⬜ Run `setAllProperties` in lib editor
- ⬜ Run `setupLibrary` in lib editor
- ⬜ Run setup function in each of the 8 modules
- ⬜ Set Module 03 web app URL
- ⬜ Configure Chat App in GCP Console
- ⬜ Add team members to registry sheet
