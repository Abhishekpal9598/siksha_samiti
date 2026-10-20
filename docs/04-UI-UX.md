# UI/UX Design Specification
## Education Committee Competition Management System

## 1. Design direction
- **Style:** modern professional, blue/white, clean and trustworthy.
- **Primary users:** students using mobile phones; Admin using laptop and mobile.
- **Language:** Hindi/Hinglish-friendly labels; use simple language and short instructions.
- **Approach:** mobile-first, accessible, consistent components, minimal animation.

## 2. Design tokens
Suggested baseline; adjust after testing with actual users.

```css
:root {
  --color-primary: #1D4ED8;
  --color-primary-hover: #1E40AF;
  --color-primary-soft: #DBEAFE;
  --color-text: #0F172A;
  --color-muted: #64748B;
  --color-border: #E2E8F0;
  --color-surface: #FFFFFF;
  --color-page: #F8FAFC;
  --color-success: #15803D;
  --color-warning: #B45309;
  --color-danger: #B91C1C;
  --radius-card: 16px;
  --radius-control: 10px;
  --shadow-card: 0 2px 12px rgba(15, 23, 42, 0.06);
}
```

Use colors semantically. Do not rely on color alone to communicate status; pair status colors with labels/icons. Keep contrast readable.

## 3. Shared layout
### Public pages
- Header: committee logo/name, Home, Competitions, Results, Login.
- Mobile header: logo/name + menu button.
- Main content constrained to a comfortable max width.
- Footer: contact/help, privacy notice, competition rules.

### Student dashboard
- Welcome message and roll number card.
- Registration status and upcoming exam card.
- Clear primary action: “Open Exam” or “Upload OMR” when available.
- Recent results list and “View Result” action.
- Profile and logout.

### Admin dashboard
- Desktop sidebar: Overview, Competitions, Students, Question Bank, Online Attempts, OMR Review, Results/Merit List, Audit Log.
- Top bar: active competition selector, admin menu.
- Summary cards: registered students, submitted exams, OMR awaiting review, results pending publication.
- Tables with search, filter, pagination, and empty/loading/error states.
- Mobile sidebar becomes a drawer; summary cards stack; tables can use responsive cards.

## 4. Required screens
### Screen 1: Home
- Committee title and brief introduction.
- Active competition card(s): registration status, date, mode, instructions.
- Buttons: “Register for Competition”, “Student Login”, “View Published Results”.
- Do not show private student data.

### Screen 2: Registration
Fields:
- Full name (required)
- Mobile number (required)
- School/college (required if committee policy requires it)
- Class/grade (required)
- Other fields only if needed and justified
- Consent checkbox/notice for use of data for competition administration
Behavior:
- Inline validation and clear error messages.
- Preserve valid fields after validation error.
- Prevent repeated submission while request is pending.
- Success screen shows competition name and roll number; do not show secret credentials.

### Screen 3: Login
- Mobile/email identifier according to implemented account model.
- Password or approved authentication method.
- Show/hide password control.
- Generic login error to avoid account enumeration.
- Rate limiting and account recovery instructions.

### Screen 4: Competition details
- Title, instructions, dates, exam mode, duration, marks, negative marking, registration status.
- Student sees eligible actions only.
- Explain whether online exam, OMR, or both are allowed.

### Screen 5: Online exam
- Header: competition name, server-derived remaining time display, save status.
- Question area with clear question number and four options A–D.
- Navigation: previous/next and question palette (if included).
- Buttons: Mark for review (optional), Submit.
- Submit confirmation includes unanswered count.
- Avoid accidental refresh/navigation; warn about unsaved answers, but never imply browser warnings guarantee data safety.
- Accessible radio inputs and keyboard navigation.

### Screen 6: OMR upload
- Display official template thumbnail/instructions.
- Show accepted file types and maximum size.
- Upload preview, progress, and retry state.
- Confirm selected competition and roll number before upload.
- Explain that an uploaded sheet may require manual verification.
- Never state “result final” at upload time.

### Screen 7: Admin OMR review
- Left: original image and optional normalized preview.
- Right: detected answers by question, status, confidence/quality warning.
- Reviewer can choose A/B/C/D/Blank and provide reason for correction.
- Clearly distinguish machine-detected answer from admin-confirmed answer.
- Save review, verify, or reject with reason.
- Maintain keyboard accessibility and avoid tiny touch targets.

### Screen 8: Results
- Student: competition name, roll number, score, total marks, correct/incorrect/unanswered, publication date, rank if published.
- Admin preview: filters, missing/unverified submission warnings, tie-break method, publish confirmation.
- Merit list: rank, roll number, approved display name, score; export CSV/print.
- Public list must not expose phone numbers, private answers, or OMR images.

## 5. Components
- `AppHeader`, `PublicLayout`, `StudentLayout`, `AdminLayout`
- `Button`, `TextField`, `SelectField`, `RadioOption`, `StatusBadge`
- `CompetitionCard`, `SummaryCard`, `DataTable`, `Pagination`
- `ConfirmDialog`, `Toast/Alert`, `LoadingState`, `EmptyState`, `ErrorState`
- `ExamTimer`, `QuestionNavigator`, `AnswerOption`
- `FileUpload`, `ImagePreview`, `OMRAnswerRow`, `ResultSummary`, `MeritListTable`

## 6. Responsive breakpoints
- Small mobile: 320–479 px
- Mobile/large phone: 480–767 px
- Tablet: 768–1023 px
- Desktop: 1024 px and above

Requirements:
- No horizontal page overflow at 360 px.
- Forms use one column on mobile.
- Buttons have comfortable touch targets (around 44 px high).
- Exam choices are easy to tap.
- Tables become scrollable or cards on mobile.
- Admin charts are optional; core data remains accessible without them.

## 7. UX states required for every data screen
- Initial loading
- Empty data
- Validation error
- Server/network error with retry
- Permission denied
- Success confirmation
- Saving/pending state
- Disabled state when action is unavailable
- Confirmation before irreversible action

## 8. Accessibility
- Semantic headings and labels.
- Visible keyboard focus.
- Form errors announced and linked to fields.
- Sufficient text contrast.
- Do not communicate only through color.
- Provide alt text for meaningful images.
- Respect reduced-motion preferences.
- Make result tables readable on narrow screens.

## 9. Content and tone
Use short, helpful copy, e.g.:
- “Registration successful. Your Roll Number is …”
- “Your answers are saved.”
- “Connection lost. Reconnect to continue saving answers.”
- “OMR sheet received. Admin verification is pending.”
- “Result has not been published yet.”
- “This action cannot be undone. Confirm before publishing.”

## 10. UI acceptance checklist
- A student can register using a 360 px mobile screen.
- Form errors are clear and preserve entered values.
- Online exam status and remaining time are visible.
- Upload preview and review state are clear.
- Admin can review detected OMR answers without confusing them with confirmed answers.
- Result page hides unpublished results and private information.
- Every page has loading, empty, and error states.
