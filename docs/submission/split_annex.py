#!/usr/bin/env python3
"""Split the built annex.pdf into two standalone PDFs:
     submission_details.pdf        (Submission details + Working MVP + Demo guide + Documentation)
     circle_product_feedback.pdf   (Circle Product Feedback)

Run AFTER build_submission_pdf.py (which produces annex.pdf).
The split point is the first page containing the 'Circle Product Feedback' heading.
"""
import os
from pypdf import PdfReader, PdfWriter

HERE = os.path.dirname(os.path.abspath(__file__))
ANNEX = os.path.join(HERE, "annex.pdf")
DETAILS = os.path.join(HERE, "submission_details.pdf")
FEEDBACK = os.path.join(HERE, "circle_product_feedback.pdf")

reader = PdfReader(ANNEX)
split = None
for i, page in enumerate(reader.pages):
    if "Circle Product Feedback" in (page.extract_text() or ""):
        split = i
        break
if split is None:
    raise SystemExit("Could not locate 'Circle Product Feedback' page in annex.pdf")

def write(path, pages, title):
    w = PdfWriter()
    for p in pages:
        w.add_page(p)
    w.add_metadata({"/Title": title, "/Author": "Ronie Joseph"})
    with open(path, "wb") as fh:
        w.write(fh)
    print(f"OK → {os.path.basename(path)} ({len(pages)} page(s))")

write(DETAILS, reader.pages[:split], "Subscription Autopilot — Submission details")
write(FEEDBACK, reader.pages[split:], "Subscription Autopilot — Circle Product Feedback")
