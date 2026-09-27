# Staff guide — running scholarship seasons

The staff workspace lives at **`/admin`** (there is also a *Staff sign-in* link in the footer). Sign in with the
foundation's staff password. Sessions last 8 hours. Use **Log out** on shared computers.

## 1. Announce a new season

1. Go to **Seasons → New season**. The *Spring 2027* season is already there as a **draft**, so you can also open it
   and edit it.
2. Fill in:
   - **Title**, e.g. *Spring 2027 Tuition Scholarship*.
   - **Term and year**. These drive the season code in application references (`SR-S27-…`).
   - **Page address (slug)**, e.g. `spring-2027`. The public page will be `/scholarships/spring-2027`. Once
     applications exist, the slug can't be changed.
   - **Opens / closes** in **Eastern Time**. The server opens and closes applications automatically at these exact
     moments.
   - **Decisions expected** (optional).
   - **Summary**: one or two sentences shown on cards and at the top of the season page.
   - **Announcement**: the full announcement. Leave a blank line between paragraphs.
   - **Eligibility / requirements** (optional): one item per line. Leave them blank to use the standard criteria
     (3.0 GPA, 3.5 GPA and 1350 SAT for incoming first-years, and so on) and the standard award terms.
3. Choose a **status**:
   - **Draft**: only staff can see it. Nothing is public.
   - **Published**: the season is announced everywhere on the site (header pill, home page, scholarships page).
     Before the opening time, visitors see *"Opening soon"* with a countdown and a *"Remind me"* sign-up. Between the
     opening and closing times, the **Apply** buttons appear. After the closing time the season shows as closed.
   - **Archived**: kept as history, with applications closed.
4. **Save**. Use **View public page** to check it.

> Tip: to get more applicants, publish the season a few weeks *before* it opens. People can then sign up for
> reminders and prepare their documents.

## 2. Review applications

**Applications** lists every submission. You can filter by season or status and search by name, email or reference.

Open an application to see:
- Contact details, address, institution, level of study and major.
- The requested tuition and payment deadline.
- Both references.
- All PDFs (resume, transcript, enrollment verification, personal statement, tuition statement and any disability
  documentation). Each opens in a new tab.
- The applicant's optional note.
- A **timeline** of everything that has happened to the application.

Set the **status** as you go:

| Status | Meaning |
|---|---|
| Received | Submitted, not yet looked at. |
| Under review | The Board is reviewing it. |
| Needs information | Something is missing. Email the applicant. |
| Awarded | Enter the **award amount**. It is paid to the institution. |
| Not awarded | Not selected this season. |
| Withdrawn | The applicant withdrew. |

**Staff notes** are private and never shown to applicants. Every change is recorded in the timeline.

Applicants can check their own status at `/scholarships/status` with their reference number and email. They see
only the status label, never notes, award amounts or documents.

**Email applicant** opens your email program with the reference already in the subject line.

## 3. Export

- **Applications CSV** covers the season you are filtering by, or all seasons. It includes contact details,
  institution, tuition, references, status, award and notes.
- **Messages CSV** and **Subscribers CSV** are also available. Import the subscriber CSV into your email tool to send
  season announcements.

Treat exports as confidential. They contain personal information.

## 4. Messages and subscribers

- **Messages** collects everything sent through the contact forms: general questions, scholarship questions,
  donation information requests, and volunteer or partnership interest. Mark each one *read* or *archived*, and
  reply by email.
- **Subscribers** are people who asked to hear when applications open, from the footer or a season's *Remind me*
  box.

## 5. Good practice

- Keep the staff password private and change it whenever someone leaves. The technical steps are in the README.
- Don't download applicant PDFs to shared or personal devices unless you need to.
- The website never makes award decisions. It only collects, organizes and tracks applications for the Board.
